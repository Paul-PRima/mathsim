// Minimal bridge from the page to the desktop shell (see main.js).
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('fractalsimDesktop', {
  keepAwake: (on) => ipcRenderer.send('keep-awake', !!on),
  taskDone: () => ipcRenderer.send('task-done'),
  setZoom: (z) => webFrame.setZoomFactor(Math.min(1.6, Math.max(0.7, +z || 1))),
  // renders an HTML page to PDF and asks where to save it; resolves to the saved path or null
  savePDF: (html, name) => ipcRenderer.invoke('save-pdf', String(html), String(name || 'mathsim.pdf')),
});
