// Minimal bridge from the page to the desktop shell (see main.js).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fractalsimDesktop', {
  keepAwake: (on) => ipcRenderer.send('keep-awake', !!on),
  taskDone: () => ipcRenderer.send('task-done'),
});
