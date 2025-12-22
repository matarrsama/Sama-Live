# 🚀 Quick Start: Auto-Updates Reference

## 30-Second Setup

### 1. Edit package.json

```json
"owner": "YOUR_GITHUB_USERNAME",  // ← Change your username
"repo": "Sama-Live"               // ← Verify repo name
```

### 2. Get GitHub Token

https://github.com/settings/tokens → Generate token with `repo` permissions

### 3. Build & Release

```powershell
$env:GH_TOKEN="your_token_here"
npm install
npm run dist
```

### 4. Create Release on GitHub

- Go to: https://github.com/YOUR_USERNAME/Sama-Live/releases
- Click "Draft a new release"
- Tag: `v0.1.0` (must match package.json version)
- Upload the `.exe` from `dist/` folder
- Click "Publish release"

---

## Commands Cheat Sheet

### Install Dependencies

```bash
npm install
```

### Build Installer

```powershell
# Windows PowerShell
$env:GH_TOKEN="your_token"
npm run dist
```

### Test Locally (without GitHub)

```bash
npm run dev
```

### Check Update Programmatically

```javascript
const result = await window.electronAPI.checkForUpdates();
console.log(result);
```

---

## User Notification Flow

```
📱 User launches app
    ↓
🔍 Auto-updater checks GitHub
    ↓
📢 Update available? → Show notification
    ↓
⬇️ User clicks "Download & Update"
    ↓
📊 Progress bar shows download (0-100%)
    ↓
✅ Download complete → "Ready to Install"
    ↓
🔄 User clicks "Restart & Install"
    ↓
🎉 App restarts with new version
```

---

## Update Notification Styles

| Notification  | Color    | Icon | Action   |
| ------------- | -------- | ---- | -------- |
| **Available** | Blue ⬇️  | ⬇️   | Download |
| **Ready**     | Green ✅ | ✅   | Install  |
| **Error**     | Red ⚠️   | ⚠️   | Dismiss  |

---

## Troubleshooting One-Liners

```powershell
# Clear cache and rebuild
Remove-Item -Recurse node_modules
npm install
npm run dist

# Check token validity
$env:GH_TOKEN="your_token"; npm run dist

# View update logs
npm run dev --verbose
```

---

## File Changes Summary

| File                           | Change                                 | Status  |
| ------------------------------ | -------------------------------------- | ------- |
| `package.json`                 | Added electron-updater, publish config | ✅ Done |
| `src/main.js`                  | Added auto-updater logic               | ✅ Done |
| `src/preload.js`               | Exposed update APIs                    | ✅ Done |
| `src/renderer/updateDialog.js` | NEW: Notification system               | ✅ Done |
| `src/renderer/style.css`       | Added notification styles              | ✅ Done |
| `src/renderer/index.html`      | Added updateDialog script              | ✅ Done |

---

## Environment Variables

```powershell
# PowerShell (Windows)
$env:GH_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxx"

# Or set permanently
[Environment]::SetEnvironmentVariable("GH_TOKEN", "your_token", "User")
```

---

## Version Update Process

```bash
# 1. Edit package.json
"version": "0.1.1"

# 2. Make code changes
# ... edit your code ...

# 3. Build
npm run dist

# 4. Create GitHub Release
# Tag: v0.1.1
# Upload: dist/Sama Live Setup 0.1.1.exe
```

---

## Pro Tips ⭐

1. **Keep token safe** - Never commit it to git
2. **Use semantic versioning** - v1.0.0 format
3. **Write good release notes** - Users want to know what changed
4. **Test locally first** - Verify build works before releasing
5. **Monitor adoption** - Check GitHub release download counts

---

## Next Action

👉 **Edit `package.json` with your GitHub username and generate a token!**

Then run:

```powershell
$env:GH_TOKEN="your_token"
npm install
npm run dist
```

---

**Questions? See `AUTO_UPDATE_GUIDE.md` for full documentation** 📖
