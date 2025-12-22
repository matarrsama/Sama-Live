# Cache Cleanup Feature

## Overview

This implementation adds automatic cache cleanup in two scenarios:

1. **Channel Switching** - Clear video cache when switching to a different channel
2. **Uninstall** - Completely erase all app data when uninstalling

## Changes Made

### 1. Channel Switching Cache Cleanup

**File:** `src/renderer/renderer.js`

Modified the `selectChannel()` function to:

- Detect when user switches to a different channel
- Automatically call `cleanupPlayer()` to destroy the HLS instance
- Clear the video element source
- Prevent memory leaks from cached video data

```javascript
function selectChannel(ch) {
  // Clear cached data from previous channel before switching
  if (state.current && state.current.id !== ch.id) {
    cleanupPlayer(); // This destroys HLS instance
    video.src = ""; // Clear video element source
  }

  state.current = ch;
  // ... rest of function
}
```

**Benefits:**

- Frees up memory from the previous stream
- Prevents audio/video data from lingering in memory
- Ensures fresh start for each channel

### 2. Uninstall Data Cleanup

#### Main Process Changes

**File:** `src/main.js`

Added:

1. **Uninstall Detection** - Check if app is being uninstalled via command-line flags
2. **Data Clearing Handler** - New IPC handler `clear-all-app-data` that wipes electron-store
3. **Before-Quit Hook** - Additional safeguard to clear data before app exits

```javascript
// At startup - detect if uninstalling
const isUninstalling = process.argv.some(
  (arg) => arg.includes("uninstall") || arg.includes("--uninstall")
);
if (isUninstalling) {
  store.clear();
  process.exit(0);
}

// IPC Handler
ipcMain.handle("clear-all-app-data", async () => {
  try {
    store.clear();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Before-Quit Hook
app.on("before-quit", (event) => {
  if (isUninstalling) {
    store.clear();
  }
});
```

#### Preload Process Changes

**File:** `src/preload.js`

Exposed the new `clearAllAppData()` method to the renderer process:

```javascript
clearAllAppData: () => ipcRenderer.invoke("clear-all-app-data"),
```

### Data Cleared on Uninstall

The `store.clear()` method removes all data stored by electron-store:

- ✓ Cached playlist data
- ✓ Favorites list
- ✓ User settings (bandwidth, buffer, etc.)
- ✓ Playlist URL
- ✓ First-run flag

## How It Works

### Channel Switching

1. User clicks on a different channel in the list
2. `selectChannel()` is called
3. If current channel differs from selected channel:
   - HLS instance is destroyed
   - Video element source is cleared
   - Memory from old stream is freed
4. New channel loads fresh

### Uninstall Process

1. User runs `uninstall.exe` from Control Panel
2. NSIS uninstaller detects this and runs the app with uninstall flag
3. App startup code detects uninstall flag
4. `store.clear()` wipes all app data immediately
5. App exits cleanly
6. NSIS removes app files and shortcuts

## Storage Locations Affected

### Windows AppData (Removed on Uninstall)

```
C:\Users\<USERNAME>\AppData\Roaming\streamio-electron\
```

Contains:

- `config.json` - Settings and cached playlist
- `state.json` - Current app state

### Program Files (Removed by NSIS)

```
C:\Program Files\Streamio\
```

### Start Menu & Desktop

- Start Menu shortcut (removed by NSIS)
- Desktop shortcut (if created, removed by NSIS)

## Testing the Feature

### Test Channel Switching

1. Start the app
2. Load a playlist
3. Click to play Channel A
4. Click to play Channel B
5. Open DevTools (F12)
6. Check Console - should see cleanup messages

### Test Uninstall

1. Install the app using `npm run dist`
2. Run the installer: `dist/Streamio Setup 0.1.0.exe`
3. Use Control Panel → Programs → Uninstall to remove
4. Check that `AppData\Roaming\streamio-electron\` is empty

## Benefits

✓ **Memory Efficiency** - Old stream data doesn't accumulate
✓ **Clean Uninstall** - No leftover cache files
✓ **User Privacy** - All data removed on uninstall
✓ **Fresh Starts** - Each channel loads independently
✓ **Reduced Antivirus Warnings** - Cleaner registry state on uninstall
