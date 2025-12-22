const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const Store = require("electron-store");
const fetch = require("node-fetch");
const fs = require("fs");

const store = new Store({
  schema: {
    playlistUrl: { type: "string", default: "" },
    cachedPlaylist: { type: "string", default: "" },
    favorites: { type: "array", default: [] },
    volume: { type: "number", default: 0.8 },
    settings: {
      type: "object",
      default: {
        lowBandwidth: true,
        autoReconnect: false,
        bufferSeconds: 20,
        limitToSD: true,
      },
    },
    firstRun: { type: "boolean", default: true },
  },
});

let mainWindow;

// Handle uninstall - check if NSIS is running uninstaller
const isUninstalling = process.argv.some(
  (arg) => arg.includes("uninstall") || arg.includes("--uninstall")
);
if (isUninstalling) {
  // Clear all stored data before app closes
  try {
    store.clear();
    console.log("App data cleared during uninstall");
  } catch (err) {
    console.error("Error clearing app data on uninstall:", err.message);
  }
  process.exit(0); // Exit immediately
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  // Remove default menu (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);
  // fast startup: show when ready
  mainWindow.once("ready-to-show", () => mainWindow.show());
}

// Single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Additional safeguard: clear data if app is being uninstalled via Control Panel
app.on("before-quit", (event) => {
  // If uninstaller is running, clear all data
  if (isUninstalling) {
    try {
      store.clear();
      console.log("Final cleanup: app data cleared on quit");
    } catch (err) {
      console.error("Error during final cleanup:", err.message);
    }
  }
});

/* IPC Handlers */
ipcMain.handle("get-settings", async () => {
  return {
    settings: store.get("settings"),
    playlistUrl: store.get("playlistUrl"),
    favorites: store.get("favorites"),
    volume: store.get("volume"),
  };
});

ipcMain.handle("get-first-run", async () => {
  return store.get("firstRun");
});

ipcMain.handle("mark-first-run-complete", async () => {
  store.set("firstRun", false);
  return { ok: true };
});

ipcMain.handle("set-volume", async (event, volume) => {
  store.set("volume", volume);
  return { ok: true };
});

ipcMain.handle("get-volume", async () => {
  return store.get("volume");
});

ipcMain.handle("set-settings", async (event, payload) => {
  store.set("settings", payload.settings || store.get("settings"));
  if (payload.playlistUrl !== undefined)
    store.set("playlistUrl", payload.playlistUrl);
  return { ok: true };
});

ipcMain.handle("clear-cache", async () => {
  store.set("cachedPlaylist", "");
  return { ok: true };
});

ipcMain.handle("get-cached-playlist", async () => {
  return store.get("cachedPlaylist");
});

ipcMain.handle("save-cached-playlist", async (event, playlistText) => {
  store.set("cachedPlaylist", playlistText || "");
  return { ok: true };
});

ipcMain.handle("fetch-playlist", async (event, url) => {
  // explicit fetch only when requested
  try {
    const res = await fetch(url, {
      timeout: 25000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: url,
        Accept: "*/*",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const text = await res.text();
    if (!text || text.length < 10) throw new Error("Empty playlist response");
    // save cached copy
    store.set("cachedPlaylist", text);
    console.log(`Fetched playlist: ${text.split("\n").length} lines`);
    return { ok: true, text };
  } catch (err) {
    console.error("Fetch error:", err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("get-favorites", async () => {
  return store.get("favorites") || [];
});

ipcMain.handle("toggle-favorite", async (event, channelId) => {
  const fav = new Set(store.get("favorites") || []);
  if (fav.has(channelId)) fav.delete(channelId);
  else fav.add(channelId);
  store.set("favorites", Array.from(fav));
  return { favorites: store.get("favorites") };
});

// Handle app uninstall - clear all cache and user data
ipcMain.handle("clear-all-app-data", async () => {
  try {
    store.clear();
    console.log("All app data cleared on uninstall");
    return { ok: true };
  } catch (err) {
    console.error("Error clearing app data:", err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("choose-file-for-playlist", async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "M3U", extensions: ["m3u", "m3u8", "txt"] }],
  });
  if (res.canceled) return null;
  return res.filePaths[0];
});

ipcMain.handle("read-local-file", async (event, filePath) => {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    // save cached copy
    store.set("cachedPlaylist", text);
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
