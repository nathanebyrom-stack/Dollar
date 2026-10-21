// Assembles src/pages + shared partials into dist/ (no dependencies).
// Each route becomes a folder with index.html so URLs are clean (/about/ not /about.html).
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const dist = join(root, 'dist');

const read = (p) => readFileSync(join(src, p), 'utf8');
const escapeAttr = (s) => s.replace(/&(?!amp;|lt;|gt;|quot;)/g, '&amp;').replace(/"/g, '&quot;');
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));

const { site, pages } = JSON.parse(read('pages.json'));
const head = read('partials/head.html');
const header = read('partials/header.html');
const footer = read('partials/footer.html');
const year = String(new Date().getFullYear());

// The automation graph (decision D4: SVG + GSAP, not WebGL) is generated here from assets/graph.json, in a wide and a tall
// layout, as real HTML. It reads fully lit with no JavaScript and under reduced motion; graph.js dims it and lights it
// node by node as you scroll. The flow is generic: no client data and no claimed results.
function automationGraph() {
  const g = JSON.parse(read('assets/graph.json'));
  const num = (n) => Math.round(n * 100) / 100;
  const svg = (name, L) => {
    const [w, h] = L.node;
    const x = L.direction === 'x';
    const edge = ([a, b]) => {
      const [ax, ay] = L.pos[a];
      const [bx, by] = L.pos[b];
      const d = x
        ? (() => { const x1 = ax + w, y1 = ay + h / 2, x2 = bx, y2 = by + h / 2, m = (x2 - x1) / 2; return `M${x1} ${y1}C${num(x1 + m)} ${y1} ${num(x2 - m)} ${y2} ${x2} ${y2}`; })()
        : (() => { const x1 = ax + w / 2, y1 = ay + h, x2 = bx + w / 2, y2 = by, m = (y2 - y1) / 2; return `M${x1} ${y1}C${x1} ${num(y1 + m)} ${x2} ${num(y2 - m)} ${x2} ${y2}`; })();
      return `      <g class="graph__edge" data-from="${a}" data-to="${b}"><path class="graph__line" d="${d}"/><path class="graph__line graph__line--lit" d="${d}"/><path class="graph__pulse" d="${d}"/></g>`;
    };
    const node = (n) => {
      const [nx, ny] = L.pos[n.id];
      const label = esc(n.label);
      const box = (cls) => `<rect class="graph__box${cls}" width="${w}" height="${h}" rx="6"/>`;
      return `      <g class="graph__node" data-node="${n.id}" transform="translate(${nx} ${ny})">${box('')}<text class="graph__label" x="${w / 2}" y="${h / 2 + 4}">${label}</text><g class="graph__lit">${box(' graph__box--lit')}<text class="graph__label graph__label--lit" x="${w / 2}" y="${h / 2 + 4}">${label}</text></g></g>`;
    };
    return `<svg class="graph graph--${name}" viewBox="0 0 ${L.size[0]} ${L.size[1]}" role="img" aria-labelledby="graph-${name}-title graph-${name}-desc">
    <title id="graph-${name}-title">${esc(g.title)}</title>
    <desc id="graph-${name}-desc">${esc(g.description)}</desc>
    <g class="graph__edges">
${g.edges.map(edge).join('\n')}
    </g>
    <g class="graph__nodes">
${g.nodes.map(node).join('\n')}
    </g>
  </svg>`;
  };
  return `<div class="graph-figure">\n  ${svg('wide', g.layouts.wide)}\n  ${svg('tall', g.layouts.tall)}\n  </div>`;
}

// The Work cards come from one manifest (assets/work/projects.json), so Home, /work/ and the 3D gallery cannot disagree.
// Statuses are text, not colour alone. Only a Live project gets an outbound link (BRIEF / showcase plan section 4).
const work = JSON.parse(read('assets/work/projects.json'));
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function workCards() {
  // One <video> per recording. Videos are muted, looping, inline and decorative; nothing downloads until it is needed.
  const video = (m, extra = '') => `<video class="work-card__video" muted loop playsinline preload="none" poster="${m.dir}${m.poster}" width="${m.width}" height="${m.height}" data-webm="${m.dir}${m.webm}" data-mp4="${m.dir}${m.mp4}" aria-hidden="true" tabindex="-1"${extra}></video>`;
  const items = work.projects.map((p) => {
    const desktop = p.media && p.media.desktop;
    const phone = p.media && p.media.phone;
    const media = desktop
      ? `      <div class="work-card__visual${phone ? ' work-card__visual--phone' : ''}">
        <div class="work-card__media" data-kind="desktop">
          ${video(desktop)}
          <button type="button" class="work-card__play" aria-label="Play the ${esc(p.name)} recording${phone ? 's' : ''}">Play</button>
        </div>${phone ? `
        <div class="work-card__media work-card__media--phone" data-kind="phone">
          ${video(phone)}
        </div>` : ''}
      </div>`
      : `      <div class="work-card__visual">
        <div class="work-card__media work-card__media--placeholder" data-kind="desktop">
          <p class="placeholder">${esc(p.placeholder)}</p>
        </div>
      </div>`;
    const visit = p.status === 'live' && p.visit
      ? `\n        <a class="work-card__visit" href="${esc(p.visit.url)}" rel="noopener noreferrer">${esc(p.visit.label)}</a>` : '';
    return `    <li class="work-card" data-project="${p.id}" data-status="${p.status}">
${media}
      <div class="work-card__body">
        <p class="work-card__status"><span class="badge badge--${p.status}">${esc(work.statuses[p.status])}</span></p>
        <h3 class="work-card__title"><a href="${p.page}">${esc(p.name)}</a></h3>
        <p class="placeholder">${esc(p.summary)}</p>${visit}
      </div>
    </li>`;
  });
  return `<ul class="work-list">\n${items.join('\n')}\n  </ul>`;
}
// Per-scene markup inside the fixed stage layer (the pre-rendered die stills); empty if a scene has none.
// A scene is "home" or "service:<name>"; a service page's stage holds only that service's own still.
const SERVICE_FACES = { web: 'web-design', marketing: 'marketing', automation: 'workflow-automation' };
function stage(scene) {
  const [kind, arg] = scene.split(':');
  const file = `partials/stage-${kind}.html`;
  if (!existsSync(join(src, file))) return '';
  return fill(read(file), { face: SERVICE_FACES[arg] || '' });
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
if (existsSync(join(src, 'assets'))) cpSync(join(src, 'assets'), join(dist, 'assets'), { recursive: true });

for (const page of pages) {
  const rawBody = read(page.source);
  const body = fill(rawBody, { work_cards: /\{\{work_cards\}\}/.test(rawBody) ? workCards() : '', automation_graph: /\{\{automation_graph\}\}/.test(rawBody) ? automationGraph() : '' });
  // Mark the current section in the nav for screen readers and styling.
  const nav = page.nav
    ? header
        .replace(`href="${page.route}"`, `href="${page.route}" aria-current="page"`)
        .replace(`data-nav="${page.nav}"`, `data-nav="${page.nav}" data-active`)
    : header;

  const html = `<!doctype html>
<html lang="en-GB">
<head>
${fill(head, {
  title: escapeAttr(page.title),
  description: escapeAttr(page.description),
  canonical: site.url + (page.route === '/404.html' ? '/' : page.route),
  robots: page.noindex ? '<meta name="robots" content="noindex">\n' : '',
  scenes: page.scene ? '<link rel="stylesheet" href="/assets/css/scenes.css">\n' : '',
})}</head>
<body data-page="${page.nav || 'none'}"${page.scene ? ` data-scene="${page.scene}"` : ''}>
${page.scene ? `<div class="scene-stage" aria-hidden="true">\n${stage(page.scene)}</div>\n` : ''}${nav}
<main id="main" tabindex="-1">
${body}</main>
${fill(footer, { year })}<script src="/assets/vendor/gsap-3.13.0.min.js" defer></script>
<script src="/assets/vendor/ScrollTrigger-3.13.0.min.js" defer></script>
<script src="/assets/vendor/lenis-1.3.27.min.js" defer></script>
<script src="/assets/js/motion.js" defer></script>
<script src="/assets/js/smooth.js" defer></script>
${page.graph ? '<script src="/assets/js/graph.js" defer></script>\n' : ''}${/\{\{work_cards\}\}/.test(rawBody) ? '<script src="/assets/js/work-cards.js" defer></script>\n' : ''}
<script src="/assets/js/main.js" defer></script>
${page.scene ? '<script type="module" src="/assets/js/scene/boot.js"></script>\n' : ''}
</body>
</html>
`;

  const out = page.route.endsWith('.html')
    ? join(dist, page.route)
    : join(dist, page.route, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`built ${page.route}`);
}
