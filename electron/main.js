// Desktop shell: opens index.html in a native window.
const { app, BrowserWindow, Menu, shell, ipcMain, powerSaveBlocker, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep rendering at full speed when the window is minimized, hidden or covered. By default Chromium
// stops painting occluded windows on Windows, throttles timers in background pages and deprioritises
// background renderers — all of which would stall a long export or video.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,IntensiveWakeUpThrottling');

const ROOT = path.join(__dirname, '..');
// The app was called Fractalsim: keep using its data folder so the saved library, favourites and
// bookmarks (stored by Chromium in userData) carry over after the rename.
app.setPath('userData', path.join(app.getPath('appData'), 'Fractalsim'));
const stateFile = () => path.join(app.getPath('userData'), 'window.json');

function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return { width: 1400, height: 900 };
  }
}

function createWindow() {
  const b = loadBounds();
  const win = new BrowserWindow({
    ...b,
    minWidth: 760,
    minHeight: 480,
    backgroundColor: '#07080b',
    title: 'Mathsim',
    icon: path.join(ROOT, 'build', 'icon.png'),
    autoHideMenuBar: true,
    // backgroundThrottling off: long exports/videos keep full speed when the window isn't focused.
    webPreferences: {
      contextIsolation: true, sandbox: true, backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  if (b.maximized) win.maximize();

  win.on('close', () => {
    try {
      fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
    } catch { /* not critical */ }
  });

  // Links to the web open in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  win.loadFile(path.join(ROOT, 'index.html'));
}

const menu = Menu.buildFromTemplate([
  { label: 'File', submenu: [{ role: 'quit' }] },
  {
    label: 'View',
    submenu: [
      { role: 'togglefullscreen' },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Reset UI size' },
      { role: 'zoomIn', label: 'Larger UI' },
      { role: 'zoomOut', label: 'Smaller UI' },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'toggleDevTools' },
    ],
  },
]);

// While a long render runs: stop Windows from suspending the app or sleeping, and flash the taskbar
// button when it finishes (useful when the window is minimized).
let blocker = null;
ipcMain.on('keep-awake', (e, on) => {
  if (on && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
  if (!on && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
});
// Worksheets and printouts: render the page's HTML in a hidden window, print it to an A4 PDF and save it.
ipcMain.handle('save-pdf', async (e, html, name) => {
  const owner = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(owner, {
    defaultPath: path.join(app.getPath('documents'), name.replace(/[\\/:*?"<>|]/g, '_')),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return null;
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'default' } });
    fs.writeFileSync(filePath, pdf);
    return filePath;
  } finally {
    win.destroy();
  }
});

ipcMain.on('task-done', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && !win.isFocused()) win.flashFrame(true);
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(menu);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
