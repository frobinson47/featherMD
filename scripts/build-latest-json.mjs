// Builds a single, cross-platform latest.json updater manifest from the
// per-platform artifacts produced by `tauri build` (invoked separately per
// OS in CI, since plain `tauri build` --- unlike tauri-apps/tauri-action's
// `updaterJsonKeepUniversal` --- only knows about the platform it ran on).
//
// Usage: node scripts/build-latest-json.mjs <artifactsDir> <tagName> <releaseNotes>
//
// <artifactsDir> must contain, per platform, the installer + its Tauri
// updater `.sig` file, gathered by CI from each matrix job's bundle output:
//   windows/<name>-setup.exe(.sig)   -> platform key windows-x86_64
//   linux/<name>.AppImage(.sig)      -> platform key linux-x86_64

import fs from 'fs';
import path from 'path';

const [, , artifactsDir, tagName, releaseNotes] = process.argv;
if (!artifactsDir || !tagName) {
  console.error('Usage: node scripts/build-latest-json.mjs <artifactsDir> <tagName> [releaseNotes]');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;

const DOWNLOAD_BASE = `https://forgejo.familytechlab.com/fmrdigital/featherMD/releases/download/${tagName}`;

const PLATFORM_TARGETS = [
  { dir: 'windows', suffix: '-setup.exe', platformKey: 'windows-x86_64' },
  { dir: 'linux', suffix: '.AppImage', platformKey: 'linux-x86_64' },
];

const platforms = {};

for (const { dir, suffix, platformKey } of PLATFORM_TARGETS) {
  const searchDir = path.join(artifactsDir, dir);
  if (!fs.existsSync(searchDir)) {
    console.warn(`Skipping ${platformKey}: ${searchDir} not found`);
    continue;
  }

  const files = fs.readdirSync(searchDir);
  const installer = files.find((f) => f.endsWith(suffix));
  if (!installer) {
    console.warn(`Skipping ${platformKey}: no *${suffix} in ${searchDir}`);
    continue;
  }

  const sigFile = `${installer}.sig`;
  const sigPath = path.join(searchDir, sigFile);
  if (!fs.existsSync(sigPath)) {
    console.warn(`Skipping ${platformKey}: missing signature file ${sigFile}`);
    continue;
  }

  platforms[platformKey] = {
    signature: fs.readFileSync(sigPath, 'utf8').trim(),
    url: `${DOWNLOAD_BASE}/${installer}`,
  };
}

if (Object.keys(platforms).length === 0) {
  console.error('No platform artifacts found; refusing to write an empty latest.json');
  process.exit(1);
}

const manifest = {
  version,
  notes: releaseNotes || `See the assets below to download and install ${tagName}.`,
  pub_date: new Date().toISOString(),
  platforms,
};

const outPath = path.join(artifactsDir, 'latest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Wrote ${outPath} with platforms: ${Object.keys(platforms).join(', ')}`);
