// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('env', {
    get: (key) => ipcRenderer.invoke('get-env', key),

    getAll: () => ipcRenderer.invoke('get-env', '*')
});
