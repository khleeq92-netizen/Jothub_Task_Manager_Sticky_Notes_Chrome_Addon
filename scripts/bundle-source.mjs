// Writes handoff/: one text file with all source, and a source ZIP (no node_modules, no dist).
//   node scripts/bundle-source.mjs
import { zipSync } from 'fflate';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'handoff');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const top = ['package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts', '.env.example', '.gitignore', 'firestore.rules', 'README.md', 'PRIVACY.md', 'HANDOFF.md'];
const dirs = ['src', 'scripts', 'tests', 'docs', 'public'];
const isText = (f) => /\.(ts|tsx|css|json|mjs|md|rules|example|gitignore)$/.test(f) || f.startsWith('.');

const files = top.filter((f) => fs.existsSync(path.join(root, f)));
const walk = (dir) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const rel = `${dir}/${entry.name}`;
    entry.isDirectory() ? walk(rel) : files.push(rel);
  }
};
dirs.forEach(walk);

fs.mkdirSync(out, { recursive: true });
const zip = {};
let text = `# Task-Mark-stickynote v${pkg.version} — complete source in one file\n\nEach section below is one file. Paths are relative to the project root.\nBinary files (icons) are not included here; they are in the source ZIP.\n`;
for (const file of files) {
  const data = fs.readFileSync(path.join(root, file));
  zip[file] = new Uint8Array(data);
  if (!isText(path.basename(file)) || file === 'HANDOFF.md' || file === 'package-lock.json') continue;
  const fence = file.endsWith('.md') ? '````' : '```';
  text += `\n\n---\n\n## FILE: ${file}\n\n${fence}${path.extname(file).slice(1)}\n${data.toString('utf8').replace(/\s+$/, '')}\n${fence}\n`;
}
fs.writeFileSync(path.join(out, 'task-mark-stickynote-all-source.md'), text);
fs.writeFileSync(path.join(out, `task-mark-stickynote-source-v${pkg.version}.zip`), zipSync(zip, { level: 9 }));
console.log(`${files.length} files`);
for (const f of fs.readdirSync(out)) console.log(`  handoff/${f}  ${(fs.statSync(path.join(out, f)).size / 1024).toFixed(0)} KB`);
