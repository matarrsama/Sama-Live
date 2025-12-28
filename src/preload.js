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
  getFirstRun: () => ipcRenderer.invoke("get-first-run"),
  markFirstRunComplete: () => ipcRenderer.invoke("mark-first-run-complete"),
  clearCache: () => ipcRenderer.invoke("clear-cache"),
  clearAllAppData: () => ipcRenderer.invoke("clear-all-app-data"),
  getCachedPlaylist: () => ipcRenderer.invoke("get-cached-playlist"),
  getCachedPlaylist1: () => ipcRenderer.invoke("get-cached-playlist-1"),
  getCachedPlaylist2: () => ipcRenderer.invoke("get-cached-playlist-2"),
  saveCachedPlaylist: (text) =>
    ipcRenderer.invoke("save-cached-playlist", text),
  saveCachedPlaylist1: (text) =>
    ipcRenderer.invoke("save-cached-playlist-1", text),
  saveCachedPlaylist2: (text) =>
    ipcRenderer.invoke("save-cached-playlist-2", text),
  fetchPlaylist: (url) => ipcRenderer.invoke("fetch-playlist", url),
  getCachedLogo: (url) => ipcRenderer.invoke("get-cached-logo", url),
  getFavorites: () => ipcRenderer.invoke("get-favorites"),
  setFavorites: (favorites) => ipcRenderer.invoke("set-favorites", favorites),
  toggleFavorite: (id) => ipcRenderer.invoke("toggle-favorite", id),
  chooseFileForPlaylist: () => ipcRenderer.invoke("choose-file-for-playlist"),
  readLocalFile: (p) => ipcRenderer.invoke("read-local-file", p),
  setVolume: (vol) => ipcRenderer.invoke("set-volume", vol),
  getVolume: () => ipcRenderer.invoke("get-volume"),
  Hls: Hls,
  on: (channel, cb) => {
    ipcRenderer.on(channel, (e, ...args) => cb(...args));
  },
});

contextBridge.exposeInMainWorld("electronAPI", {
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  startUpdateDownload: () => ipcRenderer.invoke("start-update-download"),
  cancelUpdateDownload: () => ipcRenderer.invoke("cancel-update-download"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  openDevTools: () => ipcRenderer.invoke("open-dev-tools"),
  onUpdateAvailable: (callback) =>
    ipcRenderer.on("update-available", (event, data) => callback(data)),
  onUpdateDownloadProgress: (callback) =>
    ipcRenderer.on("update-download-progress", (event, data) => callback(data)),
  onUpdateDownloaded: (callback) =>
    ipcRenderer.on("update-downloaded", () => callback()),
  onUpdateError: (callback) =>
    ipcRenderer.on("update-error", (event, data) => callback(data)),
  onUpdateNotAvailable: (callback) =>
    ipcRenderer.on("update-not-available", () => callback()),
});
