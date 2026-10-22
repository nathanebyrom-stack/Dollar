// Writes an AVIF next to every poster-*.jpg in a Work asset folder (ARCHITECTURE section 10). Dev-only.
//   cd tools && node work/avif-posters.mjs ../src/assets/work/moss-and-memory
// The JPG stays: <video poster> takes one file, and older browsers need the fallback. The AVIF is for <picture>.
import { readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(join(here, '..', 'package.json'))('sharp');
const dir = resolve(process.argv[2] || '');
if (!process.argv[2]) { console.error('Usage: node work/avif-posters.mjs <folder>'); process.exit(1); }

for (const f of readdirSync(dir).filter((n) => /^poster-.+\.jpg$/.test(n))) {
  const out = join(dir, f.replace(/\.jpg$/, '.avif'));
  const meta = await sharp(join(dir, f)).metadata();
  await sharp(join(dir, f)).avif({ quality: 50, effort: 6 }).toFile(out);
  console.log(`${f.padEnd(22)} ${meta.width}x${meta.height}  jpg ${(statSync(join(dir, f)).size / 1024).toFixed(0)} KB  ->  avif ${(statSync(out).size / 1024).toFixed(0)} KB`);
}
