'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vectraDesktop', {
  listPorts: () => ipcRenderer.invoke('sensor:list-ports'),
  loadConfig: () => ipcRenderer.invoke('sensor:load-config'),
  testConnection: config => ipcRenderer.invoke('sensor:test', config),
  connect: config => ipcRenderer.invoke('sensor:connect', config),
  disconnect: () => ipcRenderer.invoke('sensor:disconnect'),
  getDataPath: () => ipcRenderer.invoke('data:path'),
  onReading: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('sensor:reading', listener);
    return () => ipcRenderer.removeListener('sensor:reading', listener);
  },
  onStatus: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('sensor:status', listener);
    return () => ipcRenderer.removeListener('sensor:status', listener);
  }
});
