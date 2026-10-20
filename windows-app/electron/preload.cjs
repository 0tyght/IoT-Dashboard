'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const subscribe = channel => callback => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('vectraDesktop', {
  initialize: () => ipcRenderer.invoke('app:initialize'),
  listPorts: () => ipcRenderer.invoke('sensor:list-ports'),
  saveProfiles: profiles => ipcRenderer.invoke('profiles:save', profiles),
  testConnection: config => ipcRenderer.invoke('sensor:test', config),
  connect: configs => ipcRenderer.invoke('sensor:connect', configs),
  disconnect: () => ipcRenderer.invoke('sensor:disconnect'),
  history: filter => ipcRenderer.invoke('data:history', filter),
  exportData: filter => ipcRenderer.invoke('data:export', filter),
  openDataPath: () => ipcRenderer.invoke('data:open-folder'),
  exportProfiles: () => ipcRenderer.invoke('profiles:export'),
  importProfiles: () => ipcRenderer.invoke('profiles:import'),
  onReading: subscribe('sensor:reading'),
  onStatus: subscribe('sensor:status')
});
