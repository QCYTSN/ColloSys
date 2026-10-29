const { contextBridge, ipcRenderer, webFrame } = require('electron');
const { createBridge } = require('../../../.local/codecast-app/desktop-framework/src/bridge.js');
// Exact origin even if a future framework forgets its argv allowlist.
if (window.location.origin === 'http://127.0.0.1:3407') {
  const zoom = process.argv.find((value) => value.startsWith('--zoom-factor='));
  if (zoom) {
    const value = Number(zoom.split('=')[1]);
    if (value >= 0.5 && value <= 2) webFrame.setZoomFactor(value);
  }
  const bridge = createBridge({ ipcRenderer, argv: process.argv });
  const product = {
    ...bridge,
    version: 1,
    beginSignIn: (request) => ipcRenderer.invoke('collosys:auth:start:v1', request),
    setAppearance: (request) => ipcRenderer.invoke('collosys:appearance:v1', request),
  };
  contextBridge.exposeInMainWorld('__COLLOSYS_DESKTOP__', product);
  // One created bridge and one listener set. The immutable foundation still
  // reads this alias; product code uses only the versioned namespace above.
  contextBridge.exposeInMainWorld('__CODECAST_ELECTRON__', bridge);
}
