const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('swarm', {
  list: (probe) => ipcRenderer.invoke('swarm:list', probe),
  chooseProject: () => ipcRenderer.invoke('swarm:choose-project'),
  connect: (id) => ipcRenderer.invoke('swarm:connect', id),
});
