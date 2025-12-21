const { contextBridge, ipcRenderer } = require("electron");

let Hls;
try {
  Hls = require("hls.js");
} catch (e) {
  // hls.js loads from CDN in renderer instead
  Hls = null;
}

contextBridge.exposeInMainWorld("api", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (payload) => ipcRenderer.invoke("set-settings", payload),
  clearCache: () => ipcRenderer.invoke("clear-cache"),
  getCachedPlaylist: () => ipcRenderer.invoke("get-cached-playlist"),
  saveCachedPlaylist: (text) =>
    ipcRenderer.invoke("save-cached-playlist", text),
  fetchPlaylist: (url) => ipcRenderer.invoke("fetch-playlist", url),
  getFavorites: () => ipcRenderer.invoke("get-favorites"),
  toggleFavorite: (id) => ipcRenderer.invoke("toggle-favorite", id),
  chooseFileForPlaylist: () => ipcRenderer.invoke("choose-file-for-playlist"),
  readLocalFile: (p) => ipcRenderer.invoke("read-local-file", p),
  Hls: Hls,
  on: (channel, cb) => {
    ipcRenderer.on(channel, (e, ...args) => cb(...args));
  },
});
