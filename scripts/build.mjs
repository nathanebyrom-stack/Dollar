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
const stage = (scene) => (existsSync(join(src, `partials/stage-${scene}.html`)) ? read(`partials/stage-${scene}.html`) : '');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
if (existsSync(join(src, 'assets'))) cpSync(join(src, 'assets'), join(dist, 'assets'), { recursive: true });

for (const page of pages) {
  const rawBody = read(page.source);
  const body = fill(rawBody, { work_cards: workCards() });
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
${/\{\{work_cards\}\}/.test(rawBody) ? '<script src="/assets/js/work-cards.js" defer></script>\n' : ''}
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
