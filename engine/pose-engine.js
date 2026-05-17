(function () {
  'use strict';

  const POSE_ENGINE_VERSION = 'v0.9.1 Pose Foundation / PoseEngine 0.2';
  const TASKS_VERSION = '0.10.3';
  const CDN_CANDIDATES = [
    { version: '0.10.3', base: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3' },
    { version: '0.10.14', base: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14' },
    { version: 'latest', base: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision' },
    { version: '0.10.3-unpkg', base: 'https://unpkg.com/@mediapipe/tasks-vision@0.10.3' }
  ];
  const MODEL_CANDIDATES = [
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
  ];
  const PHASES = ['address', 'takeaway', 'top', 'impact', 'finish'];

  let cachedLandmarkerPromise = null;
  let lastVideoTimestamp = 0;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(a, b) {
    if (!a || !b) return NaN;
    const dx = (a.x || 0) - (b.x || 0);
    const dy = (a.y || 0) - (b.y || 0);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function midpoint(a, b) {
    if (!a && !b) return null;
    if (!a) return b;
    if (!b) return a;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2, visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1) };
  }
  function avgPoint(points) {
    const valid = points.filter(Boolean);
    if (!valid.length) return null;
    return {
      x: valid.reduce((s, p) => s + p.x, 0) / valid.length,
      y: valid.reduce((s, p) => s + p.y, 0) / valid.length,
      z: valid.reduce((s, p) => s + (p.z || 0), 0) / valid.length,
      visibility: valid.reduce((s, p) => s + (p.visibility ?? 1), 0) / valid.length,
    };
  }
  function angle(a, b) {
    if (!a || !b) return 0;
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
  function percentile(values, q) {
    const arr = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!arr.length) return 0;
    const pos = (arr.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return arr[lo];
    return arr[lo] + (arr[hi] - arr[lo]) * (pos - lo);
  }
  function normalize(value, lo, hi) {
    return clamp((value - lo) / Math.max(hi - lo, 0.0001), 0, 1);
  }
  function scoreRange(value, lowOuter, lowGood, highGood, highOuter) {
    if (!Number.isFinite(value)) return 0.5;
    if (value >= lowGood && value <= highGood) return 1;
    if (value < lowGood) return clamp((value - lowOuter) / Math.max(lowGood - lowOuter, 0.001), 0, 1);
    return clamp((highOuter - value) / Math.max(highOuter - highGood, 0.001), 0, 1);
  }
  function seek(video, time) {
    return new Promise((resolve) => {
      const duration = Number.isFinite(video.duration) ? video.duration : time;
      const safe = clamp(time, 0, duration || time || 0);
      if (Math.abs((video.currentTime || 0) - safe) < 0.025) return resolve();
      const done = () => resolve();
      video.addEventListener('seeked', done, { once: true });
      video.currentTime = safe;
    });
  }
  function withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(message || 'timeout')), ms))
    ]);
  }

  function nextVideoTimestamp(time) {
    const proposed = Math.round(performance.now() + (time || 0) * 1000);
    lastVideoTimestamp = Math.max(lastVideoTimestamp + 1, proposed);
    return lastVideoTimestamp;
  }

  async function createLandmarker(mod, vision, modelAssetPath, delegate) {
    const baseOptions = { modelAssetPath };
    if (delegate) baseOptions.delegate = delegate;
    return mod.PoseLandmarker.createFromOptions(vision, {
      baseOptions,
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.30,
      minPosePresenceConfidence: 0.30,
      minTrackingConfidence: 0.30
    });
  }

  async function loadLandmarker() {
    if (cachedLandmarkerPromise) return cachedLandmarkerPromise;
    cachedLandmarkerPromise = (async () => {
      const errors = [];
      for (const cdn of CDN_CANDIDATES) {
        try {
          const mod = await withTimeout(import(`${cdn.base}/vision_bundle.mjs`), 18000, `No se pudo cargar MediaPipe Tasks Vision desde ${cdn.base}`);
          const vision = await withTimeout(mod.FilesetResolver.forVisionTasks(`${cdn.base}/wasm`), 18000, `No se pudo cargar WASM de MediaPipe desde ${cdn.base}`);
          for (const model of MODEL_CANDIDATES) {
            try {
              try {
                const gpu = await withTimeout(createLandmarker(mod, vision, model, 'GPU'), 22000, 'Timeout inicializando Pose Landmarker GPU');
                gpu.__swingLabLoadInfo = { cdn: cdn.base, version: cdn.version, model, delegate: 'GPU' };
                return gpu;
              } catch (gpuError) {
                const cpu = await withTimeout(createLandmarker(mod, vision, model, null), 22000, 'Timeout inicializando Pose Landmarker CPU');
                cpu.__swingLabLoadInfo = { cdn: cdn.base, version: cdn.version, model, delegate: 'CPU', gpuError: String(gpuError?.message || gpuError) };
                return cpu;
              }
            } catch (modelError) {
              errors.push(`${cdn.version} · model: ${String(modelError?.message || modelError)}`);
            }
          }
        } catch (cdnError) {
          errors.push(`${cdn.version}: ${String(cdnError?.message || cdnError)}`);
        }
      }
      throw new Error(`No se pudo activar MediaPipe Pose. ${errors.slice(0, 4).join(' | ')}`);
    })();
    return cachedLandmarkerPromise;
  }

  function landmarksToFeatures(landmarks, time) {
    if (!landmarks || !landmarks.length) return null;
    const l = landmarks;
    const nose = l[0];
    const lShoulder = l[11];
    const rShoulder = l[12];
    const lElbow = l[13];
    const rElbow = l[14];
    const lWrist = l[15];
    const rWrist = l[16];
    const lHip = l[23];
    const rHip = l[24];
    const lKnee = l[25];
    const rKnee = l[26];
    const lAnkle = l[27];
    const rAnkle = l[28];
    const midShoulder = midpoint(lShoulder, rShoulder);
    const midHip = midpoint(lHip, rHip);
    const hands = avgPoint([lWrist, rWrist]);
    const elbows = avgPoint([lElbow, rElbow]);
    const knees = avgPoint([lKnee, rKnee]);
    const ankles = avgPoint([lAnkle, rAnkle]);
    const shoulderWidth = dist(lShoulder, rShoulder) || 0.16;
    const hipWidth = dist(lHip, rHip) || shoulderWidth * 0.85;
    const bodyScale = Math.max(shoulderWidth, hipWidth, 0.08);
    const avgVisibility = [nose, lShoulder, rShoulder, lWrist, rWrist, lHip, rHip, lAnkle, rAnkle]
      .filter(Boolean).reduce((s, p) => s + (p.visibility ?? 1), 0) / 9;
    const handHeightRel = hands && midHip ? (midHip.y - hands.y) / bodyScale : 0;
    const handFromAddressProxy = hands && midShoulder ? dist(hands, midShoulder) / bodyScale : 0;
    const shoulderAngle = angle(lShoulder, rShoulder);
    const hipAngle = angle(lHip, rHip);
    const spineAngle = angle(midHip, midShoulder);

    return {
      time,
      valid: true,
      visibility: avgVisibility,
      nose, midShoulder, midHip, hands, elbows, knees, ankles,
      shoulderWidth, hipWidth, bodyScale,
      handHeightRel,
      handFromAddressProxy,
      shoulderAngle, hipAngle, spineAngle,
      raw: landmarks
    };
  }

  function enrichKinematics(frames) {
    for (let i = 0; i < frames.length; i += 1) {
      const prev = frames[Math.max(0, i - 1)];
      const curr = frames[i];
      const dt = Math.max(0.001, curr.time - prev.time);
      curr.handSpeed = i && curr.hands && prev.hands ? dist(curr.hands, prev.hands) / dt : 0;
      curr.headSpeed = i && curr.nose && prev.nose ? dist(curr.nose, prev.nose) / dt : 0;
      curr.hipSpeed = i && curr.midHip && prev.midHip ? dist(curr.midHip, prev.midHip) / dt : 0;
      const anchor = frames[0];
      curr.headDrift = curr.nose && anchor.nose ? dist(curr.nose, anchor.nose) / Math.max(curr.bodyScale, 0.08) : 0;
      curr.hipShift = curr.midHip && anchor.midHip ? (curr.midHip.x - anchor.midHip.x) / Math.max(curr.bodyScale, 0.08) : 0;
      curr.handLiftFromStart = curr.handHeightRel - (anchor.handHeightRel || 0);
      curr.shoulderTurnProxy = Math.abs(curr.shoulderAngle - anchor.shoulderAngle);
      curr.hipTurnProxy = Math.abs(curr.hipAngle - anchor.hipAngle);
      if (curr.shoulderTurnProxy > Math.PI) curr.shoulderTurnProxy = Math.abs(curr.shoulderTurnProxy - Math.PI * 2);
      if (curr.hipTurnProxy > Math.PI) curr.hipTurnProxy = Math.abs(curr.hipTurnProxy - Math.PI * 2);
    }
    const speedP90 = percentile(frames.map(f => f.handSpeed), 0.90) || 0.001;
    const liftP90 = percentile(frames.map(f => f.handHeightRel), 0.90) || 0.001;
    const turnP90 = percentile(frames.map(f => f.shoulderTurnProxy), 0.90) || 0.001;
    frames.forEach(f => {
      f.normHandSpeed = clamp(f.handSpeed / speedP90, 0, 1.6);
      f.normHandHeight = normalize(f.handHeightRel, percentile(frames.map(x => x.handHeightRel), 0.10), liftP90);
      f.normTurn = clamp(f.shoulderTurnProxy / turnP90, 0, 1.5);
    });
    return frames;
  }

  function closestFrame(frames, time) {
    if (!frames.length) return null;
    let best = frames[0], bestDist = Infinity;
    for (const frame of frames) {
      const d = Math.abs(frame.time - time);
      if (d < bestDist) { best = frame; bestDist = d; }
    }
    return best;
  }
  function findFrame(frames, startTime, endTime, scorer) {
    let best = null, bestScore = -Infinity;
    for (const frame of frames) {
      if (frame.time < startTime || frame.time > endTime) continue;
      const score = scorer(frame);
      if (score > bestScore) { best = frame; bestScore = score; }
    }
    return { frame: best, score: bestScore };
  }

  function enforceOrder(times, duration) {
    const minGap = Math.max(0.035, (duration || 2) / 180);
    const result = Object.assign({}, times);
    let prev = 0;
    for (const id of PHASES) {
      if (!Number.isFinite(result[id])) result[id] = prev + minGap;
      result[id] = clamp(Math.max(result[id], prev + (id === 'address' ? 0 : minGap)), 0, duration || result[id]);
      prev = result[id];
    }
    if (Number.isFinite(duration)) result.finish = clamp(result.finish, result.impact + minGap, duration);
    return result;
  }

  function derivePosePhases(frames, baseResult, duration, view) {
    if (!frames.length) throw new Error('No pose frames');
    const base = baseResult?.phases || window.SwingLabHeuristicEngine?.fallbackTimes?.(duration) || {};
    const ext = baseResult?.extendedTimes || baseResult?.metrics?.extendedTimes || {};
    const activeStart = Number.isFinite(ext.activeStart) ? ext.activeStart : (Number.isFinite(base.address) ? base.address : 0);
    const activeEnd = Number.isFinite(ext.activeEnd) ? ext.activeEnd : (Number.isFinite(base.finish) ? base.finish : duration);
    const startFrame = closestFrame(frames, activeStart) || frames[0];
    const addressSearchEnd = Math.min(activeStart + Math.max(0.18, (activeEnd - activeStart) * 0.16), activeEnd);
    const address = findFrame(frames, Math.max(0, activeStart - 0.05), addressSearchEnd, (f) => {
      const still = 1 - clamp(f.normHandSpeed, 0, 1);
      const visibility = clamp(f.visibility, 0, 1);
      const nearBase = 1 - clamp(Math.abs(f.time - (base.address ?? activeStart)) / Math.max(activeEnd - activeStart, 0.1), 0, 1);
      return still * 0.45 + visibility * 0.30 + nearBase * 0.25;
    }).frame || startFrame;

    const baseImpact = base.impact ?? lerp(activeStart, activeEnd, 0.70);
    const baseTop = base.top ?? lerp(activeStart, activeEnd, 0.50);
    const topStart = Math.max(address.time + 0.10, activeStart + (activeEnd - activeStart) * 0.16);
    const topEnd = Math.max(topStart + 0.05, Math.min(baseImpact - 0.08, activeStart + (activeEnd - activeStart) * 0.70));
    const topPick = findFrame(frames, topStart, topEnd, (f) => {
      const baseProx = 1 - clamp(Math.abs(f.time - baseTop) / Math.max((activeEnd - activeStart) * 0.35, 0.1), 0, 1);
      const slowAtTop = 1 - clamp(f.normHandSpeed / 1.25, 0, 1);
      return f.normHandHeight * 0.42 + f.normTurn * 0.22 + slowAtTop * 0.16 + baseProx * 0.20;
    });
    const top = topPick.frame || closestFrame(frames, baseTop) || frames[Math.floor(frames.length * 0.45)];

    const impactStart = Math.max(top.time + 0.06, activeStart + (activeEnd - activeStart) * 0.52);
    const impactEnd = Math.max(impactStart + 0.06, Math.min(activeEnd - 0.05, activeStart + (activeEnd - activeStart) * 0.88));
    const addressHandY = address.hands?.y ?? closestFrame(frames, base.address)?.hands?.y ?? 0.55;
    const impactPick = findFrame(frames, impactStart, impactEnd, (f) => {
      const handYProx = 1 - clamp(Math.abs((f.hands?.y ?? addressHandY) - addressHandY) / Math.max(f.bodyScale * 1.3, 0.08), 0, 1);
      const baseProx = 1 - clamp(Math.abs(f.time - baseImpact) / Math.max((activeEnd - activeStart) * 0.28, 0.1), 0, 1);
      const speed = clamp(f.normHandSpeed, 0, 1.4) / 1.4;
      const retainedTurn = clamp(f.normTurn, 0, 1.3) / 1.3;
      return speed * 0.38 + handYProx * 0.24 + baseProx * 0.24 + retainedTurn * 0.14;
    });
    const impact = impactPick.frame || closestFrame(frames, baseImpact) || top;

    const takeawayTargetLift = address.handHeightRel + (top.handHeightRel - address.handHeightRel) * 0.22;
    let takeaway = null;
    for (const frame of frames) {
      if (frame.time <= address.time + 0.03 || frame.time >= top.time - 0.03) continue;
      const moved = Math.abs(frame.handHeightRel - address.handHeightRel) >= Math.abs(takeawayTargetLift - address.handHeightRel) * 0.55;
      const handMoved = frame.hands && address.hands ? dist(frame.hands, address.hands) / Math.max(frame.bodyScale, 0.08) > 0.35 : false;
      if (moved || handMoved) { takeaway = frame; break; }
    }
    takeaway = takeaway || closestFrame(frames, lerp(address.time, top.time, 0.28)) || address;

    const finishStart = Math.max(impact.time + 0.12, activeStart + (activeEnd - activeStart) * 0.74);
    const finishPick = findFrame(frames, finishStart, activeEnd, (f) => {
      const still = 1 - clamp((f.normHandSpeed + f.headSpeed) / 1.8, 0, 1);
      const baseProx = 1 - clamp(Math.abs(f.time - (base.finish ?? activeEnd)) / Math.max((activeEnd - activeStart) * 0.32, 0.1), 0, 1);
      const balance = 1 - clamp(Math.abs(f.hipShift || 0) / 3.2, 0, 1);
      return still * 0.34 + f.normTurn * 0.22 + baseProx * 0.28 + balance * 0.16;
    });
    const finish = finishPick.frame || closestFrame(frames, base.finish ?? activeEnd) || frames[frames.length - 1];

    const rawTimes = { address: address.time, takeaway: takeaway.time, top: top.time, impact: impact.time, finish: finish.time };
    const poseQuality = clamp(percentile(frames.map(f => f.visibility), 0.50), 0, 1);
    const topStrength = clamp(topPick.score || 0, 0, 1.3) / 1.3;
    const impactStrength = clamp(impactPick.score || 0, 0, 1.3) / 1.3;
    const poseWeight = clamp(0.34 + poseQuality * 0.30 + ((topStrength + impactStrength) / 2) * 0.22, 0.25, 0.78);

    const blended = {};
    PHASES.forEach(id => {
      const baseTime = Number.isFinite(base[id]) ? base[id] : rawTimes[id];
      const phaseSpecific = id === 'top' || id === 'impact' ? poseWeight : poseWeight * 0.76;
      blended[id] = lerp(baseTime, rawTimes[id], phaseSpecific);
    });
    const times = enforceOrder(blended, duration);

    const topFrame = closestFrame(frames, times.top) || top;
    const impactFrame = closestFrame(frames, times.impact) || impact;
    const finishFrame = closestFrame(frames, times.finish) || finish;
    const addressFrame = closestFrame(frames, times.address) || address;
    const headDriftImpact = impactFrame.headDrift || 0;
    const hipShiftImpact = impactFrame.hipShift || 0;
    const handHeightTop = topFrame.handHeightRel || 0;
    const shoulderTurnTop = topFrame.shoulderTurnProxy || 0;
    const finishStability = 1 - clamp((finishFrame.handSpeed + finishFrame.headSpeed) / Math.max(percentile(frames.map(f => f.handSpeed + f.headSpeed), 0.90), 0.001), 0, 1);

    const phaseConfidence = {
      address: clamp(0.35 + poseQuality * 0.28 + (1 - clamp(address.handSpeed / Math.max(percentile(frames.map(f => f.handSpeed), 0.90), 0.001), 0, 1)) * 0.20, 0.25, 0.96),
      takeaway: clamp(0.34 + poseQuality * 0.25 + scoreRange(times.takeaway - times.address, 0.02, 0.10, 0.55, 1.20) * 0.20, 0.25, 0.94),
      top: clamp(0.32 + poseQuality * 0.25 + topStrength * 0.34, 0.25, 0.97),
      impact: clamp(0.34 + poseQuality * 0.22 + impactStrength * 0.35, 0.25, 0.97),
      finish: clamp(0.32 + poseQuality * 0.22 + finishStability * 0.24 + scoreRange(times.finish - times.impact, 0.10, 0.40, 2.30, 3.40) * 0.16, 0.24, 0.94)
    };
    const confidence = clamp(Object.values(phaseConfidence).reduce((a, b) => a + b, 0) / 5 * 0.82 + poseQuality * 0.18, 0.25, 0.97);

    const poseSummary = {
      status: 'available',
      engine: POSE_ENGINE_VERSION,
      samples: frames.length,
      medianVisibility: poseQuality,
      poseWeight,
      view,
      top: {
        handHeightRel: handHeightTop,
        shoulderTurnProxy,
        score: topPick.score,
      },
      impact: {
        headDrift: headDriftImpact,
        hipShift: hipShiftImpact,
        handSpeed: impactFrame.handSpeed,
        score: impactPick.score,
      },
      finish: {
        stability: finishStability,
        hipShift: finishFrame.hipShift || 0,
      },
      address: {
        postureProxy: Math.abs(addressFrame.spineAngle || 0),
        handHeightRel: addressFrame.handHeightRel || 0,
      }
    };
    const extendedTimes = Object.assign({}, baseResult?.extendedTimes || {}, {
      activeStart,
      activeEnd,
      midBackswing: lerp(times.takeaway, times.top, 0.55),
      transition: times.top + Math.max(0.025, Math.min(0.08, (times.impact - times.top) * 0.22)),
      preImpact: times.impact - Math.max(0.025, Math.min(0.08, (times.impact - times.top) * 0.27))
    });
    return { times, phaseConfidence, confidence, extendedTimes, poseSummary, diagnostics: { rawTimes, poseWeight, topPick, impactPick, activeStart, activeEnd } };
  }

  async function samplePoseFrames(video, input) {
    const landmarker = await loadLandmarker();
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration) throw new Error('Video duration unavailable');
    const base = input.baseResult || {};
    const ext = base.extendedTimes || base.metrics?.extendedTimes || {};
    const start = Number.isFinite(ext.activeStart) ? Math.max(0, ext.activeStart - 0.18) : 0;
    const end = Number.isFinite(ext.activeEnd) ? Math.min(duration, ext.activeEnd + 0.18) : duration;
    const sampleCount = Math.min(input.maxPoseSamples || 84, Math.max(32, Math.round((end - start) * 24)));
    const frames = [];
    const originalTime = video.currentTime || 0;
    const wasPaused = video.paused;
    video.pause();
    for (let i = 0; i < sampleCount; i += 1) {
      const ratio = sampleCount === 1 ? 0 : i / (sampleCount - 1);
      const time = start + (end - start) * ratio;
      await seek(video, time);
      const result = landmarker.detectForVideo(video, nextVideoTimestamp(time));
      const landmarks = result?.landmarks?.[0];
      const features = landmarksToFeatures(landmarks, time);
      if (features && Number.isFinite(features.visibility) && features.visibility > 0.10) frames.push(features);
      // Yield to UI every few frames on mobile.
      if (i % 8 === 0) await new Promise(r => setTimeout(r, 0));
    }
    await seek(video, originalTime);
    if (!wasPaused) video.play().catch(() => {});
    return enrichKinematics(frames);
  }

  async function analyze(input) {
    if (!input?.video) throw new Error('video required');
    const video = input.video;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const frames = await samplePoseFrames(video, input);
    if (frames.length < 12) throw new Error('No hay suficientes landmarks fiables');
    const phaseResult = derivePosePhases(frames, input.baseResult, duration, input.view || 'dtl');
    return {
      engineVersion: POSE_ENGINE_VERSION,
      provider: 'pose-mediapipe',
      phases: phaseResult.times,
      confidence: phaseResult.confidence,
      phaseConfidence: phaseResult.phaseConfidence,
      extendedTimes: phaseResult.extendedTimes,
      poseSummary: phaseResult.poseSummary,
      diagnostics: Object.assign({ poseFrames: frames.length, loadInfo: landmarker.__swingLabLoadInfo || null }, phaseResult.diagnostics),
      profileSummary: { samples: frames.length, type: 'pose-landmarks' }
    };
  }

  window.SwingLabPoseEngine = {
    version: POSE_ENGINE_VERSION,
    provider: 'pose-mediapipe',
    analyze,
    isAvailable: () => typeof window !== 'undefined' && 'WebAssembly' in window,
    config: { tasksVersion: TASKS_VERSION, cdnCandidates: CDN_CANDIDATES.map(c => c.base), modelCandidates: MODEL_CANDIDATES }
  };
})();
