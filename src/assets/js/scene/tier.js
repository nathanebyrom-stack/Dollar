/* Quality tier (ARCHITECTURE section 6), decided once and synchronously before any 3D loads.
   Returns { tier: 'high' | 'mid' | 'low', forced, reason }. Low means no WebGL work at all: the page is just its
   HTML (and, once they exist, the pre-rendered stills). The tier can fall at runtime (stage.js) but never rises. */

const SOFTWARE = /swiftshader|llvmpipe|softpipe|microsoft basic render/i;

// '' if a real GPU WebGL2 context is available, otherwise why not.
function webglProblem() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return 'no WebGL2';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return SOFTWARE.test(renderer) ? `software renderer (${renderer})` : '';
  } catch (e) {
    return 'WebGL threw';
  }
}

export function detectTier() {
  const forced = new URLSearchParams(location.search).get('tier');
  if (forced === 'high' || forced === 'mid' || forced === 'low') return { tier: forced, forced: true, reason: 'forced by ?tier=' };

  const reduced = window.Motion ? window.Motion.reduced : matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return { tier: 'low', forced: false, reason: 'prefers-reduced-motion' };

  const problem = webglProblem();
  if (problem) return { tier: 'low', forced: false, reason: problem };

  if (navigator.connection && navigator.connection.saveData) return { tier: 'low', forced: false, reason: 'save-data' };
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return { tier: 'low', forced: false, reason: 'device memory' };
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return { tier: 'low', forced: false, reason: 'few CPU cores' };

  if (matchMedia('(pointer: coarse)').matches || innerWidth < 900) return { tier: 'mid', forced: false, reason: 'touch or narrow viewport' };
  return { tier: 'high', forced: false, reason: 'default' };
}
