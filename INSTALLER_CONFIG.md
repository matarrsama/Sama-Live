# Streamio NSIS Installer Configuration Notes

## What is NSIS?

Nullsoft Scriptable Install System (NSIS) is a lightweight, professional installer for Windows.

electron-builder generates the NSIS script automatically based on `package.json` build config.

## Streamio NSIS Setup

The following is configured in `package.json`:

```json
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "Streamio"
}
```

### Behavior

1. **Non-Silent Install** (`oneClick: false`)

   - User sees installation dialogs
   - Must click "Install" to proceed
   - Allows customization

2. **Custom Installation Path** (`allowToChangeInstallationDirectory: true`)

   - Default: `C:\Program Files\Streamio`
   - User can change to any directory (e.g., `C:\Users\MyUser\AppData\Local\Streamio`)

3. **Desktop Shortcut** (`createDesktopShortcut: true`)

   - Icon appears on Desktop after install

4. **Start Menu Entry** (`createStartMenuShortcut: true`)

   - Entry added to Start Menu → Streamio

5. **App Data Location** (automatic)
   - Settings, cache, favorites stored in:
     - `C:\Users\<USER>\AppData\Roaming\streamio-electron` (via electron-store)

## Default Installation Flow

1. User runs `Streamio Setup 0.1.0.exe`
2. Windows SmartScreen may warn (unsigned binary) — user clicks "Run anyway"
3. Welcome dialog with license info
4. Choose installation directory (defaults to Program Files)
5. Click "Install"
6. Shortcuts created (Desktop + Start Menu)
7. Optionally "Run Streamio" after install

## Uninstall

User can uninstall via:

- Control Panel → Programs → Uninstall a program → Streamio
- Or run `C:\Program Files\Streamio\uninstall.exe`

Uninstall removes app files but preserves:

- User settings, cache, favorites (stored in AppData)
- Desktop shortcut (if created)

This allows users to reinstall without losing their settings.

## Customization Options

### Add a License Page

In `package.json`, add:

```json
"nsis": {
  ...,
  "license": "LICENSE"
}
```

### Add an "Agree to Terms" Checkbox

```json
"nsis": {
  ...,
  "installerIcon": "assets/icon.ico",
  "uninstallerIcon": "assets/icon.ico"
}
```

### Change Installation Scope

To install per-user instead of system-wide:

```json
"nsis": {
  ...,
  "oneClick": false,
  "allowToChangeInstallationDirectory": true
}
```

## Icon Asset

Electron-builder looks for `assets/icon.ico` (referenced in `package.json`).

If not present, installer will use a generic Electron icon.

To add a custom icon:

1. Create a 256×256 PNG image
2. Convert to `.ico` format (use an online tool or ImageMagick)
3. Save as `assets/icon.ico`
4. Rebuild: `npm run dist`

The same icon appears in:

- Windows Add/Remove Programs
- App shortcut in Start Menu
- Desktop shortcut

## Testing the Installer

### On a Clean Virtual Machine

1. Create a Windows 10/11 VM
2. Download `Streamio Setup 0.1.0.exe` from your build machine
3. Run the installer
4. Test all app features (load playlist, play, settings, offline mode)
5. Uninstall and reinstall to verify no data is lost

### Installer Size

Expected size: ~150-200 MB (includes Chromium, Node runtime, dependencies)

---

## Next Steps

- [ ] Add `assets/icon.ico` for branded installer
- [ ] Test installer on Windows 10 and Windows 11
- [ ] Add optional code signing (requires certificate)
- [ ] Configure auto-update infrastructure (if planned)
