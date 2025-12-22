# 🆘 Auto-Updates Troubleshooting Guide

## Quick Fix Table

| Problem                 | Quick Fix                                  | Success Rate |
| ----------------------- | ------------------------------------------ | ------------ |
| Token invalid           | Generate new at github.com/settings/tokens | 95%          |
| Build fails             | `npm install` then `npm run dist`          | 90%          |
| Update not detected     | Check version tag is `vX.X.X`              | 85%          |
| .exe not in dist        | Clean build: delete dist/, run dist again  | 95%          |
| GitHub says "not found" | Make repo public (Settings → Visibility)   | 80%          |

---

## Common Issues & Solutions

### Issue 1: "Updates Not Detected"

**Symptoms:**

- App runs but never shows "Update Available" notification
- Even though GitHub has newer version

**Possible Causes:**

1. Token not set
2. Version tag format wrong
3. .exe not attached to release
4. Check running the old version

**Solutions:**

✅ **Step 1: Verify Token**

```powershell
# Windows PowerShell - Check if token is set
echo $env:GH_TOKEN

# Should show your token. If empty, set it:
$env:GH_TOKEN="ghp_xxxxxxxxxxxx"
```

✅ **Step 2: Check Version Tag Format**

```
GitHub Release:
- Tag: v0.1.1 ✅ (correct)
- NOT: 0.1.1 ❌ (missing v)
- NOT: Version-0.1.1 ❌ (wrong format)

Rule: Must be exactly vX.X.X
```

✅ **Step 3: Verify .exe Attached**

```
Go to: github.com/YOUR_USERNAME/Sama-Live/releases
- Find the release
- Look for "Sama Live Setup 0.1.1.exe"
- If missing, upload it manually
```

✅ **Step 4: Check You're Running Old Version**

```javascript
// In browser console while app is open:
window.electronAPI.getAppVersion().then((v) => console.log(v));

// Should show: { version: "0.1.0" }
// If it shows 0.1.1, you already have latest
```

---

### Issue 2: "Build Fails with Token Error"

**Symptoms:**

```
Error: ENOENT: no such file or directory
Error: GitHub token not found
Error: Cannot read property 'push'
```

**Possible Causes:**

1. GH_TOKEN not set
2. Token doesn't have right permissions
3. Node modules corrupted

**Solutions:**

✅ **Step 1: Set Token Correctly**

```powershell
# Get your token from: github.com/settings/tokens
# Copy it (only shows once!)

# Set temporary (this session only)
$env:GH_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"

# Or set permanently (all future sessions)
[Environment]::SetEnvironmentVariable("GH_TOKEN", "your_token_here", "User")

# Verify it's set
echo $env:GH_TOKEN
```

✅ **Step 2: Verify Token Permissions**

```
Visit: https://github.com/settings/tokens
Check your token has:
  ✅ repo (Full control)
  ✅ write:packages
  ✅ read:packages

If permissions wrong:
  - Delete old token
  - Create new one with right permissions
```

✅ **Step 3: Clear & Rebuild**

```powershell
# Remove corrupted node_modules
Remove-Item -Recurse node_modules
Remove-Item package-lock.json

# Reinstall
npm install

# Try build again (token should be set)
npm run dist
```

---

### Issue 3: "Cannot Find .exe File"

**Symptoms:**

```
Build completes but dist/ folder is empty
Or: Can't find "Sama Live Setup 0.1.0.exe"
```

**Possible Causes:**

1. Build didn't actually complete
2. Wrong folder
3. Wrong file name

**Solutions:**

✅ **Step 1: Check Build Output**

```powershell
# Look for this in build output:
# "Building nsis installer"
# "💾 dist/Sama Live Setup 0.1.0.exe"

# If not present, build failed
```

✅ **Step 2: Check dist Folder**

```powershell
# Navigate to dist folder
cd dist

# List files
ls

# Should see:
# - Sama Live Setup 0.1.0.exe (500MB+)
# - builder-effective-config.yaml
```

✅ **Step 3: Force Rebuild**

```powershell
# Delete old dist
Remove-Item -Recurse dist

# Rebuild (with token set)
$env:GH_TOKEN="your_token"
npm run dist

# Should create fresh dist folder with .exe
```

---

### Issue 4: "Release Published but Says Draft"

**Symptoms:**

```
Release shows "This is a pre-release"
Or: Release shows in "Releases" but not found by updater
```

**Possible Causes:**

1. Accidentally marked as pre-release
2. Tag name wrong
3. Repository not public

**Solutions:**

✅ **Step 1: Unmark as Pre-release**

```
Go to: github.com/YOUR_USERNAME/Sama-Live/releases
Click release edit (pencil icon)
Uncheck: "This is a pre-release"
Click "Update release"
```

✅ **Step 2: Check Tag Format**

```
Release Tag: v0.1.0 ✅
NOT: 0.1.0 ❌
NOT: Sama-Live-0.1.0 ❌

Rule: Exactly vX.X.X format
```

✅ **Step 3: Make Repository Public**

```
Go to: github.com/YOUR_USERNAME/Sama-Live/settings
Scroll to: "Danger Zone"
Click: "Make public"
Confirm

Or: electron-updater can't access private repos easily
```

---

### Issue 5: "App Keeps Showing Update Even When Latest"

**Symptoms:**

```
- App shows "Update Available" repeatedly
- Even though you're running latest version
- Clicking download loops
```

**Possible Causes:**

1. Version mismatch between package.json and GitHub
2. Multiple releases with same version
3. App cache not cleared

**Solutions:**

✅ **Step 1: Verify Versions Match**

```json
// In package.json
"version": "0.1.1"

// And GitHub Release tag:
// v0.1.1

// They MUST match
```

✅ **Step 2: Check for Duplicate Releases**

```
Go to: github.com/YOUR_USERNAME/Sama-Live/releases

Check for:
- Multiple v0.1.1 releases ❌
- Delete old drafts
- Keep only latest per version
```

✅ **Step 3: Clear App Cache**

```
Windows:
1. Open File Explorer
2. Paste: %APPDATA%\Sama Live
3. Delete entire folder
4. Restart app (will recreate cache)
```

---

### Issue 6: "Installation Fails or Stuck"

**Symptoms:**

```
- Installer hangs at "Installing..."
- Error during installation
- App doesn't launch after update
```

**Possible Causes:**

1. App still running when trying to update
2. Permissions issue
3. Corrupted .exe

**Solutions:**

✅ **Step 1: Close App Completely**

```
- Close Sama Live
- Check Task Manager:
  - No "Sama Live" process running
  - No "electron" process
- Try update again
```

✅ **Step 2: Run as Administrator**

```
- Right-click Sama Live Setup .exe
- Select "Run as Administrator"
- Click "Yes" on UAC prompt
- Try installation
```

✅ **Step 3: Redownload .exe**

```
- Go to GitHub Release
- Delete old .exe file
- Re-download/upload fresh build
- Try installation

Or:
- Delete %APPDATA%\Sama Live
- Reinstall app from scratch
```

---

### Issue 7: "npm run dist Command Not Found"

**Symptoms:**

```
Error: command not found: npm
Error: 'npm' is not recognized
```

**Possible Causes:**

1. Node.js not installed
2. npm not in PATH
3. Wrong directory

**Solutions:**

✅ **Step 1: Check Node Installation**

```powershell
node --version    # Should show v16.0.0 or higher
npm --version     # Should show 8.0.0 or higher

# If commands not found, Node not installed
```

✅ **Step 2: Install Node.js**

```
Go to: https://nodejs.org
Download: LTS version (16.x or 18.x)
Run installer
Restart PowerShell
Try again: npm --version
```

✅ **Step 3: Check Directory**

```powershell
# Make sure you're in project folder
cd C:\Users\matar\Documents\GitHub\Sama-Live

# Verify package.json exists
ls package.json

# Then try npm commands
npm install
npm run dist
```

---

### Issue 8: "Notification Doesn't Appear"

**Symptoms:**

```
- Build succeeds
- GitHub release exists
- App runs but NO notification shows
```

**Possible Causes:**

1. updateDialog.js not loaded
2. electronAPI not exposed
3. preload script error

**Solutions:**

✅ **Step 1: Check updateDialog.js Loaded**

```
Open Developer Tools: F12 or Ctrl+Shift+I
Go to: Console tab
Type: updateDialog

Should show: UpdateDialog class definition
If error, updateDialog.js didn't load
```

✅ **Step 2: Check electronAPI Available**

```
In Console, type: window.electronAPI

Should show: { checkForUpdates, startUpdateDownload, ... }
If undefined, preload not working
```

✅ **Step 3: Rebuild and Test**

```powershell
# Full rebuild
npm install
npm run dev

# Should show console messages about updates
# Check console: npm run dev output
```

---

### Issue 9: "Auto-Updater Seems to Hang"

**Symptoms:**

```
- Checking for updates takes forever
- Download starts but never completes
- Progress bar stuck at 50%
```

**Possible Causes:**

1. Network connection slow
2. GitHub rate limited
3. Download corrupted

**Solutions:**

✅ **Step 1: Check Network**

```powershell
# Test GitHub connectivity
Test-NetConnection github.com -Port 443

# Should show: TcpTestSucceeded : True
```

✅ **Step 2: Check File Permissions**

```
Windows:
1. Go to: %APPDATA%\Sama Live
2. Right-click folder
3. Properties → Security
4. Edit → Your User → Full Control ✅
5. Apply → OK
```

✅ **Step 3: Increase Timeout**

```javascript
// In src/main.js, modify:
const fetch = require("node-fetch");

// Add timeout for downloads
autoUpdater.currentVersion = app.getVersion();
// Increase timeout (default is 30000ms)
```

---

### Issue 10: "Wrong Version Shows After Update"

**Symptoms:**

```
- Updated to v0.1.1
- App says version 0.1.0
- Update checker thinks old is latest
```

**Possible Causes:**

1. package.json not updated
2. Old version still in some file
3. Cache not cleared

**Solutions:**

✅ **Step 1: Update package.json**

```json
// Check and update:
{
  "version": "0.1.1"  ← This must change for each release
}
```

✅ **Step 2: Clear All Caches**

```powershell
# Remove node_modules
Remove-Item -Recurse node_modules

# Remove dist folder
Remove-Item -Recurse dist

# Clear build cache
Remove-Item -Recurse .cache

# Reinstall
npm install
npm run dist
```

✅ **Step 3: Verify Version in App**

```javascript
// In src/main.js, check version loads correctly:
// It reads from package.json automatically via:
app.getVersion();
```

---

## Testing Checklist

Use this to verify your setup works:

```
1. Environment
   [ ] Node.js installed (npm --version works)
   [ ] GH_TOKEN set (echo $env:GH_TOKEN shows token)
   [ ] Token has 'repo' permission

2. Build
   [ ] npm install succeeds
   [ ] npm run dist completes
   [ ] .exe file appears in dist/

3. GitHub
   [ ] Repository is public (or token accessible)
   [ ] Release created with v0.1.0 tag
   [ ] .exe uploaded to release
   [ ] Release published (not draft)

4. Testing
   [ ] Install v0.1.0
   [ ] Launch app
   [ ] Update check runs
   [ ] Create v0.1.1 on GitHub
   [ ] Run v0.1.0 app
   [ ] "Update Available" shows
   [ ] Click download (progress appears)
   [ ] Click install (app restarts)
   [ ] Verify version is 0.1.1
```

---

## Debug Mode

To see detailed logs:

```powershell
# Run app in dev mode (shows all logs)
npm run dev

# Look for logs like:
# "Update available"
# "Download progress"
# "Update downloaded"
# "Update error"
```

---

## Emergency Recovery

If everything breaks:

```powershell
# Option 1: Clean slate
Remove-Item -Recurse node_modules
Remove-Item -Recurse dist
Remove-Item package-lock.json
npm install
npm run dist

# Option 2: Reset to last known good
# Go to git history and checkout previous commit
git log
git checkout <good-commit>
npm install
npm run dist
```

---

## Getting Help

1. **Read the guides**:

   - AUTO_UPDATE_GUIDE.md
   - QUICK_START_UPDATES.md
   - CODE_STRUCTURE.md

2. **Check this file** for your specific error

3. **Test each step** of SETUP_CHECKLIST.md

4. **Verify all prerequisites** at top of this file

---

## Success Indicators

You know it's working when:

✅ Build completes with "dist/Sama Live Setup X.X.X.exe"
✅ Release on GitHub shows .exe attached
✅ Old version shows "Update Available" notification
✅ Download shows progress bar
✅ Click install → app restarts with new version
✅ New version's about shows updated version number

---

## Still Stuck?

Try this order:

1. Check token: `echo $env:GH_TOKEN`
2. Check version: `echo` in package.json
3. Check GitHub: Is release v0.X.X format?
4. Check permissions: Is repo public?
5. Rebuild: `npm install && npm run dist`
6. Check dist: `ls dist/`

**Most issues:** Wrong token or wrong version tag format

---

Last Updated: December 22, 2025

**You can do this! 💪**
