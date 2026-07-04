// Builds the Next.js frontend as a self-contained standalone server and
// stages it where electron-builder's `extraResources` config expects it
// (see package.json). Runs before every `dist*` script via npm's pre-hooks.
//
// `output: "standalone"` (frontend/next.config.js) makes Next trace only the
// node_modules actually required at runtime into .next/standalone — but it
// deliberately omits static assets and the public/ folder (Next expects a
// CDN or reverse proxy to serve those in a real deployment), so we copy them
// in by hand. The result is a folder electron-app can spawn with Electron's
// own bundled Node — no system Node.js/npm required on the installed machine.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, '..', '..', 'frontend');
const standaloneDir = path.join(frontendDir, '.next', 'standalone');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

console.log('[build-frontend] Installing frontend dependencies...');
execSync('npm install', { cwd: frontendDir, stdio: 'inherit' });

console.log('[build-frontend] Building Next.js production bundle...');
execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });

if (!fs.existsSync(standaloneDir)) {
  throw new Error(
    `Expected standalone output at ${standaloneDir} — is "output: standalone" ` +
      'still set in frontend/next.config.js?'
  );
}

const staticSrc = path.join(frontendDir, '.next', 'static');
const staticDest = path.join(standaloneDir, '.next', 'static');
if (fs.existsSync(staticSrc)) {
  console.log('[build-frontend] Copying static assets...');
  fs.rmSync(staticDest, { recursive: true, force: true });
  copyDir(staticSrc, staticDest);
}

const publicSrc = path.join(frontendDir, 'public');
const publicDest = path.join(standaloneDir, 'public');
if (fs.existsSync(publicSrc)) {
  console.log('[build-frontend] Copying public folder...');
  fs.rmSync(publicDest, { recursive: true, force: true });
  copyDir(publicSrc, publicDest);
}

console.log(`[build-frontend] Done. Standalone server at ${standaloneDir}`);
