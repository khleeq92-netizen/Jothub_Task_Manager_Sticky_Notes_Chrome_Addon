// Builds the extension into dist/ (load that folder in chrome://extensions).
//   node scripts/build.mjs           production build
//   node scripts/build.mjs --watch   rebuild on change
//   node scripts/build.mjs --zip     production build + installable ZIP
import { build, context } from 'esbuild';
import { zipSync } from 'fflate';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');
const zip = process.argv.includes('--zip');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// Firebase defaults come from .env / .env.local (both git-ignored), never from source.
function loadEnv() {
  const env = {};
  for (const file of ['.env', '.env.local']) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}
const env = loadEnv();

const common = {
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __FIREBASE_DEFAULTS__: JSON.stringify({
      apiKey: env.FIREBASE_API_KEY ?? '',
      projectId: env.FIREBASE_PROJECT_ID ?? '',
      googleClientId: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    }),
  },
};

const bundles = [
  { entryPoints: [path.join(root, 'src/app/main.tsx')], outfile: path.join(dist, 'app.js') },
  { entryPoints: [path.join(root, 'src/background/worker.ts')], outfile: path.join(dist, 'background.js') },
  { entryPoints: [path.join(root, 'src/content/index.ts')], outfile: path.join(dist, 'content.js') },
];

const page = (surface) => `<!doctype html>
<html lang="en" data-surface="${surface}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jot Hub</title>
<link rel="icon" href="icons/icon48.png">
<link rel="stylesheet" href="app.css">
</head>
<body>
<div id="root"></div>
<script src="app.js"></script>
</body>
</html>
`;

function writeStatic() {
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'app.html'), page('tab'));
  fs.writeFileSync(path.join(dist, 'popup.html'), page('popup'));
  fs.writeFileSync(path.join(dist, 'panel.html'), page('panel'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
}

function makeZip() {
  const files = {};
  const walk = (dir, prefix = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.DS_Store') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, `${prefix}${entry.name}/`);
      else files[`${prefix}${entry.name}`] = new Uint8Array(fs.readFileSync(full));
    }
  };
  walk(dist);
  const name = `jot-hub-extension-v${pkg.version}.zip`;
  fs.writeFileSync(path.join(root, name), zipSync(files, { level: 9 }));
  console.log(`\n  ${name}  ${(fs.statSync(path.join(root, name)).size / 1024).toFixed(0)} KB`);
}

fs.rmSync(dist, { recursive: true, force: true });
writeStatic();

if (watch) {
  for (const options of bundles) await (await context({ ...common, ...options })).watch();
  console.log('Watching for changes…');
} else {
  await Promise.all(bundles.map((options) => build({ ...common, ...options })));
  if (zip) makeZip();
}
