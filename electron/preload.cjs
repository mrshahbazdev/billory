const { contextBridge, ipcRenderer } = require('electron');

// Explicit allowlist. No generic invoke() escape hatch.
contextBridge.exposeInMainWorld('api', {
  store: {
    load: () => ipcRenderer.invoke('store:load'),
    save: (doc) => ipcRenderer.invoke('store:save', doc),
    snapshot: (doc, label) => ipcRenderer.invoke('store:snapshot', doc, label),
    history: () => ipcRenderer.invoke('store:history'),
    restore: (id) => ipcRenderer.invoke('store:restore', id)
  },
  export: {
    pdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
    text: (payload) => ipcRenderer.invoke('export:text', payload),
    json: (payload) => ipcRenderer.invoke('export:json', payload),
    binary: (payload) => ipcRenderer.invoke('export:binary', payload)
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    openFile: (opts) => ipcRenderer.invoke('app:openFile', opts || {}),
    openUserData: () => ipcRenderer.invoke('app:openUserData')
  }
});
