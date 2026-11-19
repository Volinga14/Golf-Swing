/* Guide coordinates are relative to the uncropped, cited image. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SwingLabGuides = api;
})(globalThis, () => {
  'use strict';
  const kinds = {
    head: {label:'Cabeza', color:'#ffd477'},
    posture: {label:'Perfil y postura', color:'#c9ed7e'},
    hips: {label:'Pelvis', color:'#79ddff'},
    hands: {label:'Manos', color:'#fc9dc9'},
    club: {label:'Palo', color:'#b6a6ff'}
  };
  const validPoint = p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 1);
  function normalize(value, evidence) {
    if (!Array.isArray(value)) return [];
    const guides = [];
    for (const guide of value.slice(0, 24)) {
      if (!guide || !Object.hasOwn(kinds, guide.kind) || !evidence.has(guide.frame_id)) continue;
      if (!['line','box','point'].includes(guide.shape) || !validPoint(guide.from)) continue;
      if (guide.shape !== 'point' && (!validPoint(guide.to) || Math.hypot(guide.to[0]-guide.from[0], guide.to[1]-guide.from[1]) < .012)) continue;
      guides.push({frame_id:guide.frame_id, kind:guide.kind, shape:guide.shape, from:[...guide.from], ...(guide.shape === 'point' ? {} : {to:[...guide.to]})});
    }
    return guides;
  }
  function frameGuides(review, frameId) {
    return (review?.visual_guides || []).filter(guide => guide.frame_id === frameId);
  }
  function svg(guides, width, height) {
    if (!guides.length || !(width > 0 && height > 0)) return '';
    width = Math.round(width); height = Math.round(height);
    const content = guides.map(guide => {
      const x = guide.from[0]*width, y = guide.from[1]*height;
      const color = kinds[guide.kind].color;
      if (guide.shape === 'point') return `<circle cx="${x}" cy="${y}" r="${Math.max(width,height)*.018}" fill="none" stroke="${color}"/>`;
      const x2 = guide.to[0]*width, y2 = guide.to[1]*height;
      if (guide.shape === 'box') return `<rect x="${Math.min(x,x2)}" y="${Math.min(y,y2)}" width="${Math.abs(x2-x)}" height="${Math.abs(y2-y)}" fill="none" stroke="${color}"/>`;
      return `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${color}"/><circle cx="${x}" cy="${y}" r="${Math.max(width,height)*.007}" fill="${color}"/><circle cx="${x2}" cy="${y2}" r="${Math.max(width,height)*.007}" fill="${color}"/>`;
    }).join('');
    return `<svg class="swing-guide-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" fill="none" stroke-width="${Math.max(width,height)*.004}" stroke-linecap="round">${content}</svg>`;
  }
  return {kinds, normalize, frameGuides, svg};
});
