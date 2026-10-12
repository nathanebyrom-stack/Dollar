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

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
if (existsSync(join(src, 'assets'))) cpSync(join(src, 'assets'), join(dist, 'assets'), { recursive: true });

for (const page of pages) {
  const body = read(page.source);
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
})}</head>
<body data-page="${page.nav || 'none'}">
${nav}
<main id="main" tabindex="-1">
${body}</main>
${fill(footer, { year })}<script src="/assets/js/main.js" defer></script>
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
