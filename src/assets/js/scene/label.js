/* The die's face label (decision D18): a small machined caption under the die naming the face that is showing,
   so nobody has to guess what an engraving means. The names are the site's own service names, not new copy.
   The label is aria-hidden: on Home the service panels carry the same names for assistive tech, and on a service
   page the h1 does, so the caption is a visual aid only. Used by stage.js (live die) and stills.js (Low path). */

export const FACE_NAMES = {
  '34': '34 Automation',
  'web-design': 'Web design',
  'marketing': 'Marketing',
  'workflow-automation': 'Workflow automation',
};

// A service page's scene name -> the face it rests on (mirrors stage.js SERVICE_FACES).
export const SCENE_FACES = {
  'service:web': 'web-design',
  'service:marketing': 'marketing',
  'service:automation': 'workflow-automation',
};

export function createDieLabel(parent) {
  const el = document.createElement('div');
  el.className = 'die-label';
  el.setAttribute('aria-hidden', 'true');
  parent.appendChild(el);
  let face = null;
  return {
    el,
    set(nextFace) {
      if (nextFace === face) return;
      face = nextFace;
      el.textContent = FACE_NAMES[nextFace] || '';
    },
    dispose() { el.remove(); },
  };
}
