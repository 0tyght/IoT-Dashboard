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
  chartRange: filter => ipcRenderer.invoke('data:chart-range', filter),
  configureRecording: config => ipcRenderer.invoke('recording:configure', config),
  startRecording: () => ipcRenderer.invoke('recording:start'),
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  exportData: filter => ipcRenderer.invoke('data:export', filter),
  openDataPath: () => ipcRenderer.invoke('data:open-folder'),
  openRunDataPath: runId => ipcRenderer.invoke('data:open-run-folder', runId),
  importWaveform: () => ipcRenderer.invoke('analysis:import-waveform'),
  exportProfiles: () => ipcRenderer.invoke('profiles:export'),
  importProfiles: () => ipcRenderer.invoke('profiles:import'),
  onReading: subscribe('sensor:reading'),
  onStatus: subscribe('sensor:status'),
  onRecording: subscribe('recording:state')
});
