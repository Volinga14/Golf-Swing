(function () {
  'use strict';

  const STORAGE_KEY = 'swingLabOnlineEngineUrl';
  const USER_KEY = 'swingLabUserId';
  const CLUB_KEY = 'swingLabClub';
  const VERSION = 'OnlineEngineClient v1.1.0-local-pc-compatible';

  function cleanUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function getBaseUrl() {
    const local = cleanUrl(localStorage.getItem(STORAGE_KEY) || '');
    const configured = cleanUrl(window.SWING_LAB_CONFIG?.ONLINE_ENGINE_URL || '');
    return local || configured;
  }

  function isEnabled() {
    return Boolean(window.SWING_LAB_CONFIG?.USE_ONLINE_ENGINE !== false && getBaseUrl());
  }

  function configure(url) {
    const cleaned = cleanUrl(url);
    if (cleaned) localStorage.setItem(STORAGE_KEY, cleaned);
    else localStorage.removeItem(STORAGE_KEY);
    return getBaseUrl();
  }

  function getUserId() {
    return localStorage.getItem(USER_KEY) || window.SWING_LAB_CONFIG?.USER_ID || 'victor';
  }

  function normalizeView(view) {
    const raw = String(view || '').toLowerCase().replace('-', '_');
    if (raw.includes('face')) return 'face_on';
    if (raw.includes('fo')) return 'face_on';
    if (raw.includes('dtl')) return 'dtl';
    return raw || 'unknown';
  }

  function normalizeClub(club) {
    const raw = String(club || '').toLowerCase();
    if (['driver', 'iron', 'wedge', 'putter'].includes(raw)) return raw;
    if (raw.includes('hierro')) return 'iron';
    return raw || 'unknown';
  }

  function phaseTime(value) {
    if (Number.isFinite(value)) return value;
    if (value && Number.isFinite(value.time)) return value.time;
    if (value && Number.isFinite(value.seconds)) return value.seconds;
    if (value && Number.isFinite(value.t)) return value.t;
    return null;
  }

  function normalizeServerResult(data) {
    const phaseMarks = data.phases || data.times || data.phaseTimes || {};
    const phases = {};
    const phaseConfidence = {};
    ['address', 'takeaway', 'top', 'impact', 'finish'].forEach((id) => {
      const value = phaseMarks[id];
      const t = phaseTime(value);
      if (Number.isFinite(t)) phases[id] = t;
      if (value && Number.isFinite(value.confidence)) phaseConfidence[id] = value.confidence;
    });

    const metrics = data.metrics || {};
    const poseAvailable = Boolean(data.debug?.pose?.available || metrics.pose_quality || metrics.poseQuality);
    return {
      sessionId: data.session_id || data.sessionId || null,
      engineVersion: data.engineVersion || data.engine_version || 'online-engine',
      provider: data.provider || 'online-backend-python',
      confidence: Number(data.confidence ?? metrics.phase_quality ?? metrics.phaseQuality ?? metrics.global_score / 100 ?? 0.72),
      phases,
      times: phases,
      phaseConfidence: data.phaseConfidence || data.phase_confidence || phaseConfidence,
      extendedTimes: data.extendedTimes || data.extended_times || {},
      metrics: Object.assign({}, metrics, {
        engineVersion: data.engineVersion || data.engine_version || 'online-engine',
        backendSessionId: data.session_id || data.sessionId || null,
      }),
      diagnostics: data.diagnostics || data.debug || {},
      poseStatus: poseAvailable ? 'available' : 'unavailable',
      poseSummary: data.poseSummary || data.pose_summary || {
        status: poseAvailable ? 'available' : 'unavailable',
        quality: metrics.pose_quality ?? metrics.poseQuality ?? null,
        backend: true,
      },
      profileSummary: data.profileSummary || data.profile_summary || {
        type: 'online-backend',
        samples: data.debug?.detection?.motion_samples || data.samples || 0,
        poseSamples: data.debug?.detection?.pose_samples || data.poseSamples || 0,
      },
      report: data.report || null,
      reportUrl: data.report_url || data.reportUrl || null,
      captures: data.captures || null,
      findings: data.findings || [],
      recommendations: data.recommendations || [],
      drills: data.drills || [],
      warnings: data.warnings || [],
      raw: data,
    };
  }

  async function ping(timeoutMs = 6000) {
    const base = getBaseUrl();
    if (!base) return { ok: false, error: 'online-engine-url-not-configured' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}/api/health`, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Object.assign({ ok: true }, await res.json());
    } catch (error) {
      clearTimeout(timer);
      return { ok: false, error: String(error?.message || error) };
    }
  }

  async function getLatestModel() {
    const base = getBaseUrl();
    if (!base) throw new Error('online-engine-url-not-configured');
    const res = await fetch(`${base}/api/model/latest`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`latest-model-http-${res.status}`);
    return res.json();
  }

  async function analyze({ file, metadata = {}, timeoutMs = 120000 }) {
    const base = getBaseUrl();
    if (!base) throw new Error('online-engine-url-not-configured');
    if (!file) throw new Error('missing-video-file');

    const view = normalizeView(metadata.view || metadata.guideMode || localStorage.getItem('swingLabGuideMode') || 'dtl');
    const club = normalizeClub(metadata.club || localStorage.getItem(CLUB_KEY) || 'iron');
    const userId = metadata.userId || metadata.user_id || getUserId();

    const form = new FormData();
    // Backend v0.1.1 expects `file`; v1.1 also accepts `video` for compatibility.
    form.append('file', file, file.name || metadata.videoName || 'swing-video.mp4');
    form.append('metadata', JSON.stringify(metadata));
    form.append('view', view);
    form.append('club', club);
    form.append('user_id', userId);
    form.append('save_video', 'true');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}/api/analyze`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        let detail = '';
        try { detail = await res.text(); } catch (_) {}
        throw new Error(`online-analyze-http-${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
      }
      return normalizeServerResult(await res.json());
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
  }

  function trainingPayloadFromRecord(record) {
    const raw = record || {};
    const sessionId = raw.backendSessionId
      || raw.session_id
      || raw.sessionId
      || raw.onlineResultSummary?.sessionId
      || raw.onlineResultSummary?.session_id
      || raw.onlineResultSummary?.backendSessionId
      || raw.metrics?.backendSessionId
      || raw.autoDetection?.diagnostics?.session_id
      || raw.autoDetection?.diagnostics?.sessionId;

    const final = raw.finalPhaseTimes || raw.corrected_phases || raw.correctedPhases || {};
    const corrected = {};
    ['address', 'takeaway', 'top', 'impact', 'finish'].forEach((id) => {
      const t = phaseTime(final[id]);
      if (Number.isFinite(t)) corrected[id] = t;
    });

    if (!sessionId) throw new Error('missing-backend-session-id; run online analysis before submitting training');
    if (Object.keys(corrected).length < 3) throw new Error('missing-corrected-phases');

    return {
      session_id: sessionId,
      user_id: raw.userId || raw.user_id || getUserId(),
      corrected_phases: corrected,
      quality: raw.quality || 'good',
      notes: raw.notes || raw.notesForTraining || 'Corrección enviada desde PWA Swing Lab.',
      view: normalizeView(raw.view || raw.guideMode || 'dtl'),
      club: normalizeClub(raw.club || localStorage.getItem(CLUB_KEY) || 'iron'),
      include_in_training: raw.include_in_training !== false,
    };
  }

  async function submitTraining(record, { includeVideo = false, file = null } = {}) {
    const base = getBaseUrl();
    if (!base) throw new Error('online-engine-url-not-configured');
    const payload = trainingPayloadFromRecord(record);

    // Send JSON because backend training endpoint expects TrainingCorrection.
    const res = await fetch(`${base}/api/training/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`training-submit-http-${res.status}: ${await res.text().catch(() => '')}`);
    return res.json();
  }

  window.SwingLabOnlineEngine = {
    version: VERSION,
    storageKey: STORAGE_KEY,
    getBaseUrl,
    configure,
    isEnabled,
    ping,
    getLatestModel,
    analyze,
    submitTraining,
    trainingPayloadFromRecord,
  };
})();
