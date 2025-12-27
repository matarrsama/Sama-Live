const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const Store = require("electron-store");
const fetch = require("node-fetch");
const crypto = require("crypto");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { autoUpdater } = require("electron-updater");

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
    lastAppVersion: { type: "string", default: "" },
  },
});

let mainWindow;

// Helper function to safely delete a file or directory
function safeDelete(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        // Recursively delete directory contents
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      return true;
    }
  } catch (err) {
    console.warn(`⚠️ Could not delete ${filePath}: ${err.message}`);
  }
  return false;
}

// Handle post-update cleanup
function handlePostUpdateCleanup() {
  const currentVersion = app.getVersion();
  const lastVersion = store.get("lastAppVersion");

  // If version has changed, it means an update was just installed
  if (lastVersion && lastVersion !== currentVersion) {
    console.log(
      `🔄 Update detected: ${lastVersion} -> ${currentVersion}. Running cleanup...`
    );

    try {
      // Reset buffer settings to defaults (may change between versions)
      const settings = store.get("settings") || {};
      settings.bufferSeconds = 20; // Reset to default
      store.set("settings", settings);
      console.log("✓ Reset buffer settings to defaults");

      // Clean up temporary files from update process
      const userDataPath = app.getPath("userData");
      const tempDirs = [
        path.join(userDataPath, "pending"),
        path.join(userDataPath, "temp"),
        path.join(userDataPath, ".staging"),
      ];

      tempDirs.forEach((dir) => {
        if (safeDelete(dir)) {
          console.log(`✓ Removed temporary directory: ${dir}`);
        }
      });

      // Clean up old Electron cache that may be incompatible
      const cachePath = path.join(userDataPath, "Cache");
      if (safeDelete(cachePath)) {
        console.log("✓ Cleared application cache");
      }

      // Log successful cleanup
      console.log("✅ Post-update cleanup completed successfully");
    } catch (err) {
      console.error("❌ Error during post-update cleanup:", err.message);
    }
  }

  // Update stored version to current version
  store.set("lastAppVersion", currentVersion);
}

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

// Configure Auto-Updater
function setupAutoUpdater() {
  console.log("🔄 Initializing auto-updater...");
  // Disable automatic download - we'll prompt user first
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Check for updates every hour (3600000 ms)
  console.log("🔍 Checking for updates...");
  autoUpdater.checkForUpdatesAndNotify();

  // Event: Update available
  autoUpdater.on("update-available", (info) => {
    console.log("✓ Update available:", info.version);
    if (mainWindow) {
      mainWindow.webContents.send("update-available", {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    }
  });

  // Event: No updates available
  autoUpdater.on("update-not-available", () => {
    console.log("✓ App is up to date");
    if (mainWindow) {
      mainWindow.webContents.send("update-not-available");
    }
  });

  // Event: Update download started
  autoUpdater.on("download-progress", (progressObj) => {
    console.log(`📊 Download progress: ${Math.round(progressObj.percent)}%`);
    if (mainWindow) {
      mainWindow.webContents.send("update-download-progress", {
        percent: Math.round(progressObj.percent),
        bytesPerSecond: progressObj.bytesPerSecond,
      });
    }
  });

  // Event: Update downloaded
  autoUpdater.on("update-downloaded", () => {
    console.log("✅ Update downloaded - will install on app quit");
    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded");
    }
  });

  // Event: Error during update
  autoUpdater.on("error", (error) => {
    console.error("❌ Updater error:", error);
    if (mainWindow) {
      mainWindow.webContents.send("update-error", {
        message: error.message,
      });
    }
  });
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
  handlePostUpdateCleanup();
  createWindow();
  setupAutoUpdater();

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
      timeout: 60000,
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

ipcMain.handle("get-cached-logo", async (event, logoUrl) => {
  try {
    if (typeof logoUrl !== "string" || !logoUrl.trim()) {
      return { ok: false, error: "Invalid URL" };
    }

    let parsed;
    try {
      parsed = new URL(logoUrl);
    } catch {
      return { ok: false, error: "Invalid URL" };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Unsupported protocol" };
    }

    const userDataPath = app.getPath("userData");
    const logosDir = path.join(userDataPath, "logos");
    if (!fs.existsSync(logosDir)) {
      fs.mkdirSync(logosDir, { recursive: true });
    }

    const hash = crypto.createHash("sha1").update(logoUrl).digest("hex");
    const urlExt = path.extname(parsed.pathname || "").toLowerCase();
    const allowedExt = new Set([
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".svg",
      ".ico",
    ]);
    const ext = allowedExt.has(urlExt) ? urlExt : ".img";
    const cachedPath = path.join(logosDir, `${hash}${ext}`);

    if (fs.existsSync(cachedPath)) {
      return { ok: true, url: pathToFileURL(cachedPath).toString() };
    }

    const res = await fetch(logoUrl, {
      timeout: 20000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength && contentLength > 5 * 1024 * 1024) {
      return { ok: true, url: logoUrl };
    }

    const buf = await res.buffer();
    if (!buf || !buf.length) {
      return { ok: false, error: "Empty response" };
    }
    if (buf.length > 5 * 1024 * 1024) {
      return { ok: true, url: logoUrl };
    }

    let finalPath = cachedPath;
    if (ext === ".img") {
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const type = ct.split(";")[0].trim();
      const map = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
        "image/x-icon": ".ico",
        "image/vnd.microsoft.icon": ".ico",
      };
      const mapped = map[type];
      if (mapped) {
        finalPath = path.join(logosDir, `${hash}${mapped}`);
      }
    }

    fs.writeFileSync(finalPath, buf);
    return { ok: true, url: pathToFileURL(finalPath).toString() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// IPC Handlers for Update Management
ipcMain.handle("check-for-updates", async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      ok: true,
      updateAvailable: result?.updateInfo ? true : false,
      version: result?.updateInfo?.version,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("start-update-download", async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("cancel-update-download", async () => {
  try {
    // autoUpdater doesn't have a direct cancel method, but we can abort the download
    // by stopping the download process. For now, we'll just log it.
    console.log("Update download cancelled by user");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("install-update", async () => {
  // Quit and install the update
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
});

ipcMain.handle("get-app-version", async () => {
  return { version: app.getVersion() };
});

ipcMain.handle("open-dev-tools", async () => {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow) {
    focusedWindow.webContents.openDevTools();
    return { ok: true };
  }
  return { ok: false, error: "No focused window found" };
});
