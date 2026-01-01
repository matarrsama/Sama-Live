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
    playlistUrl2: { type: "string", default: "" },
    cachedPlaylist: { type: "string", default: "" },
    cachedPlaylist1: { type: "string", default: "" },
    cachedPlaylist2: { type: "string", default: "" },
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
    windowState: {
      type: "object",
      default: {
        width: 1200,
        height: 800,
        x: undefined,
        y: undefined,
        isMaximized: false,
      },
    },
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

// Window state management
function saveWindowState(window) {
  if (!window) return;
  
  try {
    const bounds = window.getBounds();
    const isMaximized = window.isMaximized();
    
    // Only save position if window is not maximized
    const windowState = {
      width: bounds.width,
      height: bounds.height,
      isMaximized: isMaximized,
    };
    
    // Only save x,y if window is not maximized and not in fullscreen
    if (!isMaximized && !window.isFullScreen()) {
      windowState.x = bounds.x;
      windowState.y = bounds.y;
    }
    
    store.set("windowState", windowState);
    console.log("Window state saved:", windowState);
  } catch (err) {
    console.warn("Failed to save window state:", err.message);
  }
}

function getValidWindowBounds(savedState) {
  const { screen } = require("electron");
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  
  // Default bounds if no saved state or invalid
  const defaultBounds = {
    width: 1200,
    height: 800,
    x: workArea.x + Math.floor((workArea.width - 1200) / 2),
    y: workArea.y + Math.floor((workArea.height - 800) / 2),
  };
  
  if (!savedState) {
    return defaultBounds;
  }
  
  // Ensure window is within screen bounds
  const bounds = {
    width: Math.max(800, Math.min(savedState.width || 1200, workArea.width)),
    height: Math.max(600, Math.min(savedState.height || 800, workArea.height)),
  };
  
  // Position validation
  if (savedState.x !== undefined && savedState.y !== undefined) {
    bounds.x = Math.max(workArea.x, Math.min(savedState.x, workArea.x + workArea.width - bounds.width));
    bounds.y = Math.max(workArea.y, Math.min(savedState.y, workArea.y + workArea.height - bounds.height));
  } else {
    bounds.x = defaultBounds.x;
    bounds.y = defaultBounds.y;
  }
  
  return bounds;
}

function createWindow() {
  const savedWindowState = store.get("windowState");
  const bounds = getValidWindowBounds(savedWindowState);
  
  console.log("Creating window with bounds:", bounds);

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    show: false, // Don't show until ready-to-show
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Restore maximized state if saved
  if (savedWindowState?.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  
  // Remove default menu (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);
  
  // Show window when ready to prevent visual flicker
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    
    // If window was maximized, ensure it's properly maximized after showing
    if (savedWindowState?.isMaximized) {
      mainWindow.maximize();
    }
  });

  // Setup window state saving
  let saveTimeout;
  
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveWindowState(mainWindow);
    }, 500); // Debounce saves to avoid too frequent writes
  };

  // Save window state on resize and move
  mainWindow.on("resize", debouncedSave);
  mainWindow.on("move", debouncedSave);
  mainWindow.on("maximize", debouncedSave);
  mainWindow.on("unmaximize", debouncedSave);
  
  // Save state when window is closing
  mainWindow.on("close", () => {
    saveWindowState(mainWindow);
    if (saveTimeout) clearTimeout(saveTimeout);
  });
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
    playlistUrl2: store.get("playlistUrl2"),
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
  if (payload.playlistUrl2 !== undefined)
    store.set("playlistUrl2", payload.playlistUrl2);
  return { ok: true };
});

ipcMain.handle("clear-cache", async () => {
  try {
    // Clear cached playlist
    store.set("cachedPlaylist", "");
    store.set("cachedPlaylist1", "");
    store.set("cachedPlaylist2", "");
    
    // Clear favorites
    store.set("favorites", []);
    
    // Clear favorites file if it exists
    if (fs.existsSync(favoritesPath)) {
      fs.unlinkSync(favoritesPath);
    }
    
    // Clear logo cache
    const userDataPath = app.getPath("userData");
    const logosDir = path.join(userDataPath, "logos");
    if (fs.existsSync(logosDir)) {
      fs.rmSync(logosDir, { recursive: true, force: true });
    }
    
    console.log("✓ Cache and favorites cleared");
    return { ok: true };
  } catch (error) {
    console.error("Error clearing cache:", error);
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("get-cached-playlist", async () => {
  return store.get("cachedPlaylist");
});

ipcMain.handle("get-cached-playlist-1", async () => {
  return store.get("cachedPlaylist1");
});

ipcMain.handle("get-cached-playlist-2", async () => {
  return store.get("cachedPlaylist2");
});

ipcMain.handle("save-cached-playlist", async (event, playlistText) => {
  store.set("cachedPlaylist", playlistText || "");
  return { ok: true };
});

ipcMain.handle("save-cached-playlist-1", async (event, playlistText) => {
  store.set("cachedPlaylist1", playlistText || "");
  return { ok: true };
});

ipcMain.handle("save-cached-playlist-2", async (event, playlistText) => {
  store.set("cachedPlaylist2", playlistText || "");
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

ipcMain.handle("set-favorites", async (event, favorites) => {
  const arr = Array.isArray(favorites) ? favorites : [];
  store.set("favorites", arr);
  return { ok: true, favorites: store.get("favorites") };
});

ipcMain.handle("toggle-favorite", async (event, channelId) => {
  const fav = new Set(store.get("favorites") || []);
  if (fav.has(channelId)) fav.delete(channelId);
  else fav.add(channelId);
  store.set("favorites", Array.from(fav));
  return { favorites: store.get("favorites") };
});

// Handle app uninstall - clear all cache and user data
app.on('will-quit', () => {
  // Don't clear favorites on quit, only on uninstall
});

// Handle uninstall - clear all data including favorites
const handleUninstall = () => {
  try {
    // Clear all data including favorites
    store.clear();
    // Also delete the favorites file if it exists
    if (fs.existsSync(favoritesPath)) {
      fs.unlinkSync(favoritesPath);
    }
    console.log('✓ All app data cleared during uninstall');
  } catch (error) {
    console.error('Error during uninstall cleanup:', error);
  }
};

// Listen for uninstall events
if (process.platform === 'win32') {
  // For Windows
  app.on('window-all-closed', () => {
    if (process.argv.includes('--uninstall')) {
      handleUninstall();
    }
  });
}

// IPC Handlers
ipcMain.handle("clear-all-app-data", async () => {
  try {
    handleUninstall();
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
    const currentVersion = app.getVersion();
    const availableVersion = result?.updateInfo?.version;
    
    // Only consider update available if versions are different
    const updateAvailable = availableVersion && availableVersion !== currentVersion;
    
    return {
      ok: true,
      updateAvailable: updateAvailable,
      version: availableVersion,
      currentVersion: currentVersion,
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
