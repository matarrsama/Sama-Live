# Streamio — Build & Release Guide

## Prerequisites

- Node.js 18+ and npm
- Git (optional, for version control)
- Windows 10/11 development machine for testing

## Development Setup

```bash
# Clone or extract project
cd streamio-electron

# Install dependencies
npm install

# Run in dev mode (hot reload recommended but not configured)
npm start
```

## Building the Windows Installer

### Step 1: Install Build Dependencies

Already included in `devDependencies`:

- `electron` — Electron framework
- `electron-builder` — Packaging tool for Windows NSIS installer

### Step 2: Build Distribution

```bash
npm run dist
```

This will:

1. Package the Electron app with all dependencies
2. Create a Windows installer (NSIS format)
3. Output files to `dist/` folder

Expected output:

```
dist/
  ├── Streamio Setup 0.1.0.exe  (installer)
  └── ... (other build artifacts)
```

### Step 3: Test the Installer

1. Locate `dist/Streamio Setup 0.1.0.exe`
2. Run the installer on a clean Windows machine
3. Accept the license and installation directory
4. Create a Start Menu shortcut and Desktop shortcut (optional)
5. Launch the app from the Start Menu or Desktop shortcut

## Customizing the Build

### Icon

The NSIS installer uses `assets/icon.ico` (referenced in `package.json`).

To add a custom icon:

1. Create or convert a PNG/image to `.ico` format (recommended: 256x256)
2. Save as `assets/icon.ico`
3. Rebuild: `npm run dist`

### Installer Settings

Edit `package.json` → `build.nsis` section:

```json
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "Streamio"
}
```

- `oneClick: false` — User chooses installation directory
- `allowToChangeInstallationDirectory: true` — Custom install path allowed
- `createDesktopShortcut: true` — Adds Desktop icon
- `createStartMenuShortcut: true` — Adds Start Menu folder

### Uninstaller

The NSIS installer automatically generates an uninstaller in:

```
C:\Program Files\Streamio\uninstall.exe
```

Or via Control Panel → Programs → Uninstall a program.

## Version Bumping

Update version in `package.json`:

```json
{
  "version": "0.2.0"
}
```

Next build will use this version in the installer filename:

```
Streamio Setup 0.2.0.exe
```

## Release Checklist

- [ ] Update `version` in `package.json`
- [ ] Test app with `npm start` (verify all features work)
- [ ] Test offline playback (cache a playlist, disconnect network)
- [ ] Run `npm run dist`
- [ ] Test installer on clean Windows machine
- [ ] Verify favorites, settings, cache persist across restarts
- [ ] Document release notes (optional)

## Known Limitations

- No code signing (optional, requires certificate)
- No auto-update infrastructure (ready to implement but disabled)
- Installer requires admin privileges for `Program Files` installation
  - Workaround: Change installation directory to user AppData

## Troubleshooting

### Build fails with "Icon not found"

```
Error: assets/icon.ico not found
```

**Fix**: Either create the icon file or comment out `"icon"` in `package.json` build section.

### Installer runs but app doesn't launch

Check `%LOCALAPPDATA%\streamio-electron\logs` for error logs.

### Installer won't uninstall

- Ensure app is fully closed
- Try uninstall from Control Panel
- Manually delete `C:\Program Files\Streamio` (if stuck)

## Distribution

Once tested, distribute the `.exe` installer via:

- GitHub Releases
- Direct link / file hosting
- Windows installer package (MSI optional, use NSIS for simplicity)

Users should verify file hash if distributing outside official channels.

---

For more Electron Builder options, see: https://www.electron.build/
