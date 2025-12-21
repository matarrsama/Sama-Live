# Streamio — Electron M3U/M3U8 TV Player

Lightweight Electron app to stream live TV from a user-provided M3U or M3U8 playlist on Windows.

## Features

- Load playlist from URL or local file
- Cache playlist locally so app opens offline
- Left sidebar with grouped channels and favorites
- HTML5 video + hls.js playback with buffering and retry logic
- Low bandwidth settings and auto-reconnect
- Simple, responsive UI with Play/Pause/Stop controls

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Windows 10 or Windows 11

### Development

```bash
npm install
npm start
```

### Build Windows Installer

```bash
npm run dist
```

This creates a Windows installer (NSIS format) in the `dist/` folder.

### Testing the Installer

After running `npm run dist`, locate the installer:

- `dist/Streamio Setup 0.1.0.exe` (or similar version number)
- Run the installer and follow the prompts

## Configuration

Settings are stored locally in:

- Windows: `%APPDATA%\streamio-electron`

Stored data:

- Cached playlist
- Favorites list
- User settings (low bandwidth, auto-reconnect, buffer size)

## Usage

1. **First Run**: A disclaimer appears on startup.
2. **Add Playlist**:
   - Open Settings (gear icon)
   - Paste a playlist URL or import a local file
   - Click **Save**
3. **Refresh**: Click **Refresh** to fetch the latest playlist from your URL
4. **Playback**: Click a channel to start playback
5. **Offline**: The app uses cached playlists when offline

## Architecture

- **Main Process** (`src/main.js`): Electron app lifecycle, IPC handlers, store management
- **Preload** (`src/preload.js`): Secure API exposure, hls.js bundled
- **Renderer** (`src/renderer/renderer.js`): UI logic, playlist parsing, playback
- **Parser** (`src/lib/playlistParser.js`): M3U/M3U8 parsing helpers

## Key Optimizations

- **Low Bandwidth**: Prefer SD streams, buffer set to 20 seconds
- **Auto Retry**: 3 retry attempts on playback failure (configurable)
- **Offline First**: Cached playlist loads instantly without internet
- **No Background Polling**: Fetch only on user request
- **Fast Startup**: Under 3 seconds on typical hardware

## Legal

- **No bundled playlists**: Users provide their own M3U/M3U8 URLs
- **No backend**: All data is local to the user's device
- **No cloud sync**: Privacy-focused, standalone app

## Troubleshooting

**Playlist won't load**

- Check URL is accessible and in M3U/M3U8 format
- Try importing a local file instead

**Playback freezing**

- Enable "Low bandwidth mode" in Settings
- Increase buffer size if connection is unstable

**App won't start**

- Ensure dependencies are installed: `npm install`
- Check Node.js version: `node --version` (should be 18+)

## Future Improvements

- App auto-updates (infrastructure ready but not enabled)
- EPG guide integration
- M3U playlist editing / validation UI
- Support for other stream formats (DASH, SMOOTH)

---

**License**: MIT  
**Author**: Streamio Contributors
