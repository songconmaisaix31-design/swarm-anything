const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('swarm', {
  list: (probe) => ipcRenderer.invoke('swarm:list', probe),
  chooseProject: () => ipcRenderer.invoke('swarm:choose-project'),
  connect: (id) => ipcRenderer.invoke('swarm:connect', id),
  diagnoseTabbit: () => ipcRenderer.invoke('swarm:diagnose-tabbit'),
  verify: (id) => ipcRenderer.invoke('swarm:verify', id),
});
