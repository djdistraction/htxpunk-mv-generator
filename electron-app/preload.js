const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  openStorage: () => ipcRenderer.invoke('open-storage'),
  appVersion: () => ipcRenderer.invoke('app-version'),
  onOpenSettings: (callback) => ipcRenderer.on('open-settings', callback),
  setupComplete: (config) => ipcRenderer.send('setup-complete', config),
});
