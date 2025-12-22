# 📁 Auto-Update Code Structure

## Overview

Your auto-update system is built on 3 layers:

```
┌─────────────────────────────────────────────┐
│  Renderer (UI) - updateDialog.js            │  ← User sees this
├─────────────────────────────────────────────┤
│  IPC Bridge - preload.js                    │  ← Safe communication
├─────────────────────────────────────────────┤
│  Main Process - main.js                     │  ← Update logic
└─────────────────────────────────────────────┘
         │
         ↓
    GitHub Releases (Distribution)
```

---

## Layer 1: Main Process (src/main.js)

### What it does:

- Initializes `electron-updater`
- Checks for updates on startup
- Handles update download
- Listens for update events
- Installs updates on app restart

### Key Functions:

```javascript
setupAutoUpdater()
├─ autoUpdater.checkForUpdatesAndNotify()
├─ autoUpdater.on('update-available')
├─ autoUpdater.on('download-progress')
├─ autoUpdater.on('update-downloaded')
└─ autoUpdater.on('error')

IPC Handlers:
├─ check-for-updates
├─ start-update-download
├─ install-update
└─ get-app-version
```

### Configuration:

```javascript
autoUpdater.autoDownload = false; // Don't auto-download
autoUpdater.autoInstallOnAppQuit = true; // Install on quit
```

---

## Layer 2: IPC Bridge (src/preload.js)

### What it does:

- Safely exposes updater functions to renderer
- Uses IPC for secure communication
- Prevents direct access to system APIs

### Exposed APIs:

```javascript
window.electronAPI = {
  // Invoke methods (async)
  checkForUpdates(),
  startUpdateDownload(),
  installUpdate(),
  getAppVersion(),

  // Listen to events
  onUpdateAvailable(callback),
  onUpdateDownloadProgress(callback),
  onUpdateDownloaded(callback),
  onUpdateError(callback),
  onUpdateNotAvailable(callback)
}
```

---

## Layer 3: Renderer UI (src/renderer/updateDialog.js)

### What it does:

- Displays update notifications
- Shows download progress
- Handles user interactions
- Manages UI state

### UpdateDialog Class:

```javascript
UpdateDialog
├─ setupListeners()          // Connect to IPC events
├─ showUpdateNotification()  // Show "Update Available"
├─ showUpdateReadyNotification() // Show "Ready to Install"
├─ showErrorNotification()   // Show errors
├─ updateDownloadProgress()  // Update progress bar
├─ downloadUpdate()          // Start download
├─ installUpdate()           // Trigger installation
└─ dismissNotification()     // Close notification
```

### Notification States:

```
┌─────────────────────────────────┐
│  📥 Update Available            │  (Blue)
│  Download & Update | Later      │
└─────────────────────────────────┘
         ↓
         ↓ (User clicks Download)
         ↓
┌─────────────────────────────────┐
│  📊 Downloading... 45%          │  (Blue with progress)
│  [█████░░░░░░░░░░░░] 45%        │
└─────────────────────────────────┘
         ↓
         ↓ (Download completes)
         ↓
┌─────────────────────────────────┐
│  ✅ Update Ready to Install     │  (Green)
│  Restart & Install | Later      │
└─────────────────────────────────┘
         ↓
         ↓ (User clicks Install)
         ↓
    App Restarts with New Version
```

---

## Event Flow Diagram

```javascript
// 1. App starts
app.whenReady() → setupAutoUpdater()

// 2. Check for updates
autoUpdater.checkForUpdatesAndNotify()

// 3. Update available event
autoUpdater → 'update-available'
  ↓
mainWindow.send('update-available', data)
  ↓
preload → ipcRenderer.on('update-available')
  ↓
renderer → window.electronAPI.onUpdateAvailable()
  ↓
updateDialog.showUpdateNotification()
  ↓
[Show Blue Notification]

// 4. User clicks download
updateDialog.downloadUpdate()
  ↓
window.electronAPI.startUpdateDownload()
  ↓
preload → ipcRenderer.invoke('start-update-download')
  ↓
mainWindow → autoUpdater.downloadUpdate()

// 5. Download progress
autoUpdater → 'download-progress'
  ↓
mainWindow.send('update-download-progress')
  ↓
renderer → updateDownloadProgress()
  ↓
[Update progress bar]

// 6. Download complete
autoUpdater → 'update-downloaded'
  ↓
mainWindow.send('update-downloaded')
  ↓
renderer → showUpdateReadyNotification()
  ↓
[Show Green Notification]

// 7. User clicks install
updateDialog.installUpdate()
  ↓
window.electronAPI.installUpdate()
  ↓
preload → ipcRenderer.invoke('install-update')
  ↓
mainWindow → autoUpdater.quitAndInstall()
  ↓
[App quits and installs update]
  ↓
[App restarts with new version]
```

---

## Configuration in package.json

```json
{
  "version": "0.1.0", // ← Update this for new versions

  "build": {
    "appId": "com.example.sama-live",

    "publish": {
      "provider": "github",
      "owner": "YOUR_USERNAME", // ← Set this
      "repo": "Sama-Live" // ← Verify this
    }
  }
}
```

---

## GitHub Release Structure

```
GitHub Repository (Sama-Live)
└── Releases
    ├── v0.1.0 (current)
    │   └── Sama Live Setup 0.1.0.exe ← Downloaded by users
    ├── v0.1.1 (newer, when available)
    │   └── Sama Live Setup 0.1.1.exe
    └── v0.1.2 (fallback if needed)
        └── Sama Live Setup 0.1.2.exe
```

---

## CSS Styling Structure (style.css)

```css
.update-notification               /* Container */
/* Container */
├─ .update-notification-available  /* Blue (available) */
├─ .update-notification-ready      /* Green (ready) */
└─ .update-notification-error      /* Red (error) */

.update-notification-content       /* Inner wrapper */
├─ .update-notification-header     /* Title bar */
│  ├─ .update-icon                 /* Icon (⬇️ ✅ ⚠️) */
│  ├─ .update-title                /* "Update Available" text */
│  └─ .update-close-btn            /* × button */
├─ .update-message                 /* Description text */
├─ .progress-container             /* Download progress */
│  ├─ .progress-bar                /* Outer bar */
│  ├─ .progress-fill               /* Inner fill (animates) */
│  └─ .progress-text               /* "45%" text */
└─ .update-actions                 /* Button container */
   ├─ .btn-update-download         /* Blue button */
   ├─ .btn-update-install          /* Blue button */
   └─ .btn-update-later; /* Gray button */
```

---

## Data Flow Summary

### When Check Happens:

```
Startup → main.js → autoUpdater.checkForUpdates()
             ↓
          GitHub API (fetch latest release)
             ↓
          If newer version exists:
             ↓
          preload.js → renderer.js
             ↓
          updateDialog.js → Show notification
```

### When Download Happens:

```
User clicks download → renderer.js → preload.js → main.js
                                          ↓
                                   autoUpdater.download()
                                          ↓
                                   GitHub API (stream binary)
                                          ↓
                                   Progress updates sent to renderer
                                          ↓
                                   Save to app data folder
```

### When Install Happens:

```
User clicks install → renderer.js → preload.js → main.js
                                         ↓
                                   autoUpdater.quitAndInstall()
                                         ↓
                                   App closes
                                         ↓
                                   Installer runs
                                         ↓
                                   App restarts (new version)
```

---

## Key Classes & Methods

### autoUpdater (electron-updater)

```javascript
autoUpdater.checkForUpdates(); // Manual check
autoUpdater.downloadUpdate(); // Start download
autoUpdater.quitAndInstall(); // Install & restart
autoUpdater.on(event, callback); // Listen to events
```

### UpdateDialog (custom class)

```javascript
showUpdateNotification(version); // Display notification
updateDownloadProgress(percent); // Update progress bar
installUpdate(); // Trigger install
dismissNotification(element); // Close notification
```

---

## Security Layers

```
┌─────────────────────────────────┐
│ GitHub (Public Releases)        │  ← Secure source
├─────────────────────────────────┤
│ Version Verification            │  ← Check tag matches
├─────────────────────────────────┤
│ User Approval                   │  ← User clicks download
├─────────────────────────────────┤
│ Non-blocking Download           │  ← App continues running
├─────────────────────────────────┤
│ Install on Quit                 │  ← Safe moment to install
├─────────────────────────────────┤
│ Error Handling                  │  ← Graceful failures
└─────────────────────────────────┘
```

---

## File Dependencies

```
package.json
├─ electron-updater (dependency)
└─ electron-builder (dev dependency)

main.js
├─ const { autoUpdater } = require('electron-updater')
└─ [Update logic]

preload.js
├─ contextBridge.exposeInMainWorld('electronAPI', {...})
└─ [IPC handlers]

updateDialog.js
├─ window.electronAPI
└─ [Notification system]

style.css
├─ .update-notification
└─ [UI styling]

index.html
├─ <script src="updateDialog.js"></script>
└─ [Loads notification system]
```

---

## How It Stays Professional

✅ **Non-intrusive**: Notifications don't block the app
✅ **User-controlled**: Users choose when to install
✅ **Transparent**: Clear progress tracking
✅ **Reliable**: Error handling for all scenarios
✅ **Responsive**: Works on all screen sizes
✅ **Branded**: Matches your app's design
✅ **Efficient**: Only checks at startup (not every second)
✅ **Secure**: Uses GitHub as trusted source

---

That's the complete structure! Each layer handles its responsibility, and they communicate securely through IPC. 🚀
