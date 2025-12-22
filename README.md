# Sama-Live — Electron M3U/M3U8 TV Player

Lightweight Electron app to stream live TV from a user-provided M3U or M3U8 playlist on Windows.

## Features

- Load playlist from URL or local file
- **Multiple default playlists**: Choose from IPTV or XUMO with masked URLs for privacy
- **Fast search**: Find channels by name or group across thousands of channels
- Cache playlist locally so app opens offline
- Left sidebar with grouped channels and favorites
- HTML5 video + hls.js playback with buffering and retry logic
- Low bandwidth settings and auto-reconnect
- **Volume persistence**: Remember your preferred volume level (default 80%)
- Simple, responsive UI with Play/Pause/Stop controls
- **Optimized for large playlists**: Handles 10,000+ channels smoothly

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
2. **Load Playlist**:
   - Open Settings (gear icon)
   - Select a default playlist (IPTV or XUMO) from the dropdown, or paste a custom playlist URL
   - Click **Load Selected** to load your chosen playlist
   - Or click **Import Playlist File** to load from a local file
3. **Search**: Use the search box to find channels by name or group
4. **Refresh**: Click **Refresh** to fetch the latest playlist from your URL
5. **Playback**: Click a channel to start playback
6. **Offline**: The app uses cached playlists when offline
7. **Settings**: Adjust volume, bandwidth mode, buffer size, and auto-reconnect options

## Architecture

- **Main Process** (`src/main.js`): Electron app lifecycle, IPC handlers, store management
- **Preload** (`src/preload.js`): Secure API exposure, hls.js bundled
- **Renderer** (`src/renderer/renderer.js`): UI logic, playlist parsing, playback
- **Parser** (`src/lib/playlistParser.js`): M3U/M3U8 parsing helpers

## Key Optimizations

- **Low Bandwidth**: Prefer SD streams, buffer set to 20 seconds
- **Auto Retry**: 3 retry attempts on playback failure (configurable)
- **Offline First**: Cached playlist loads instantly without internet
- **Search Optimization**: Fast full-text search across all channels
- **Lazy Loading**: Groups collapse by default for large playlists (1000+ channels)
- **Performance**: Batch rendering for smooth UI with 10,000+ channels
- **No Background Polling**: Fetch only on user request
- **Fast Startup**: Under 3 seconds on typical hardware
- **Smart Group Management**: Single groups always expanded, multiple groups collapse by default
- **Volume Persistence**: Audio level remembered across sessions (default 80%)

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

**License**: Proprietary (see LICENSE file for details)  
**Author**: Matarr Sama (Streamio Developer)  
**Contact**: matarrsama@gmail.com
