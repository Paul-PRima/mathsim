// Builds the Windows installer (dist/installer/Mathsim-Setup-<version>.exe) from the packaged app in
// dist/Mathsim-win32-x64 (run `npm run package` first). The installer settings are in package.json → "build".
// Uses electron-builder's API rather than its command line, so it also works when run through Electron as Node.
const path = require('path');
const fs = require('fs');
const builder = require('electron-builder');

const root = path.join(__dirname, '..');
const app = path.join(root, 'dist', 'Mathsim-win32-x64');
if (!fs.existsSync(path.join(app, 'Mathsim.exe'))) {
  console.error('dist/Mathsim-win32-x64/Mathsim.exe not found — run `npm run package` first.');
  process.exit(1);
}

builder.build({
  projectDir: root,
  targets: builder.Platform.WINDOWS.createTarget('nsis', builder.Arch.x64),
  prepackaged: app,
  publish: 'never',
}).then((files) => {
  console.log('Installer:\n  ' + files.filter((f) => f.endsWith('.exe')).join('\n  '));
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
