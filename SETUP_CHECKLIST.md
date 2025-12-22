# ✅ Professional Auto-Updates Setup Checklist

## Pre-Setup Requirements

- [ ] GitHub account (https://github.com)
- [ ] Your repository is public OR you have access token
- [ ] Node.js & npm installed
- [ ] Electron app building working (`npm run dist` works)

---

## Phase 1: Configuration (5 minutes)

### 1. Update package.json

- [ ] Open `package.json`
- [ ] Find line 52: `"owner": "YOUR_GITHUB_USERNAME"`
- [ ] Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username
- [ ] Verify `"repo": "Sama-Live"` matches your repo name
- [ ] Save file

### 2. Verify Version

- [ ] Check current version in `package.json` (should be `0.1.0`)
- [ ] Note this version - you'll need it for GitHub Release

### 3. Code Review (Optional)

- [ ] Check `AUTO_UPDATE_GUIDE.md` - 5 minute read
- [ ] Check `QUICK_START_UPDATES.md` - 2 minute reference
- [ ] Check `CODE_STRUCTURE.md` - understanding the system

---

## Phase 2: GitHub Setup (10 minutes)

### 1. Generate Personal Access Token

- [ ] Go to: https://github.com/settings/tokens
- [ ] Click "Generate new token (classic)"
- [ ] Give it a name: "Sama-Live Build Token"
- [ ] Select these permissions:
  - [ ] ✅ repo (Full control of private repositories)
  - [ ] ✅ write:packages
  - [ ] ✅ read:packages
- [ ] Click "Generate token"
- [ ] **Copy the token immediately** (you won't see it again!)
- [ ] Store it somewhere safe (password manager, etc.)

### 2. Set Environment Variable (Windows PowerShell)

```powershell
# Option 1: Temporary (current session only)
$env:GH_TOKEN="your_token_here"

# Option 2: Permanent (all future sessions)
[Environment]::SetEnvironmentVariable("GH_TOKEN", "your_token_here", "User")
```

- [ ] Replace `your_token_here` with actual token
- [ ] Verify it's set: `echo $env:GH_TOKEN` (should show token)

### 3. Prepare Repository

- [ ] Go to your repo: https://github.com/YOUR_USERNAME/Sama-Live
- [ ] Verify repo is public (Settings → Change to public if needed)
- [ ] Check that Releases section exists (GitHub creates it automatically)

---

## Phase 3: Build & Test (10 minutes)

### 1. Install Dependencies

```bash
npm install
```

- [ ] Command completes without errors
- [ ] `node_modules` folder created

### 2. Test Locally

```bash
npm run dev
```

- [ ] App launches
- [ ] App functions normally
- [ ] Close app when done

### 3. Build Installer

```powershell
# Make sure GH_TOKEN is set
$env:GH_TOKEN="your_token"
npm run dist
```

- [ ] Build completes successfully
- [ ] `.exe` file created in `dist/` folder
- [ ] Check file size > 100MB (should be reasonable)

### 4. Find Built File

- [ ] Navigate to `dist/` folder
- [ ] Find file named: `Sama Live Setup 0.1.0.exe`
- [ ] Verify file size (note: should be ~150MB+)

---

## Phase 4: Create GitHub Release (5 minutes)

### 1. Go to Releases Page

- [ ] Visit: https://github.com/YOUR_USERNAME/Sama-Live/releases
- [ ] Click "Draft a new release"

### 2. Fill Release Details

- [ ] **Tag version**: Type `v0.1.0` (MUST start with `v`)
- [ ] **Release title**: Type `Version 0.1.0`
- [ ] **Description**: Add release notes (e.g., "Initial release with auto-updates")

### 3. Upload Installer

- [ ] Click "Attach binaries..." OR drag and drop
- [ ] Select: `dist/Sama Live Setup 0.1.0.exe`
- [ ] Wait for upload to complete

### 4. Publish Release

- [ ] Uncheck "This is a pre-release" (unless it is)
- [ ] Click "Publish release"
- [ ] Verify release appears in releases list

---

## Phase 5: Test Auto-Update (10 minutes)

### 1. Install v0.1.0

- [ ] Go to your release
- [ ] Download `Sama Live Setup 0.1.0.exe`
- [ ] Install the app
- [ ] Launch the app

### 2. Check for Updates (Manual Check)

- [ ] App should check GitHub automatically on startup
- [ ] Check console: `npm run dev` to see log messages
- [ ] If no update available: "App is up to date" (expected - it's latest)

### 3. Create v0.1.1 for Testing

- [ ] Edit `package.json`: Change version to `0.1.1`
- [ ] Edit `src/main.js`: Add comment (e.g., `// Version 0.1.1`)
- [ ] Build: `npm run dist`
- [ ] Create new GitHub Release:
  - [ ] Tag: `v0.1.1`
  - [ ] Upload: `dist/Sama Live Setup 0.1.1.exe`
  - [ ] Publish

### 4. Test Update Detection

- [ ] Run v0.1.0 app
- [ ] Should see notification: "Update Available - Version 0.1.1"
- [ ] Click "Download & Update"
- [ ] Watch progress bar (0-100%)
- [ ] Click "Restart & Install"
- [ ] App restarts with v0.1.1
- [ ] Verify version changed: Check in About or app title

---

## Phase 6: Documentation (2 minutes)

### 1. Document Changes

- [ ] Create/update CHANGELOG.md
- [ ] List what changed in v0.1.1
- [ ] Note: "Added professional auto-update system"

### 2. Share with Team

- [ ] Share `AUTO_UPDATE_GUIDE.md`
- [ ] Share `QUICK_START_UPDATES.md`
- [ ] Share this checklist
- [ ] Brief explanation of auto-update system

### 3. Update README

- [ ] Add section: "Auto-Updates"
- [ ] Mention: "App automatically checks for updates on startup"
- [ ] Link to `AUTO_UPDATE_GUIDE.md`

---

## Phase 7: Production Release (5 minutes)

### 1. Reset to Stable Version

- [ ] Edit `package.json`: Change version back to `0.1.0` (or increment to `0.2.0`)
- [ ] Review all code changes
- [ ] Ensure app is stable

### 2. Final Build

```powershell
npm run dist
```

- [ ] Build succeeds
- [ ] .exe file created

### 3. Create Release

- [ ] Go to GitHub Releases
- [ ] Create release with your version tag
- [ ] Upload final .exe
- [ ] Publish

### 4. Communicate to Users

- [ ] Update app's About dialog with new version
- [ ] Send release notes to users
- [ ] Highlight auto-update feature

---

## Troubleshooting Checklist

### Build Fails

- [ ] Clear cache: `Remove-Item -Recurse node_modules`
- [ ] Reinstall: `npm install`
- [ ] Try again: `npm run dist`

### Token Invalid

- [ ] Generate new token: https://github.com/settings/tokens
- [ ] Check token has `repo` permission
- [ ] Verify `$env:GH_TOKEN` is set: `echo $env:GH_TOKEN`

### Release Not Found

- [ ] Tag format must be: `vX.X.X` (with lowercase 'v')
- [ ] Tag must match version in `package.json`
- [ ] Release must be published (not draft)

### Update Not Detected

- [ ] Verify newer version published on GitHub
- [ ] Check tag format: `vX.X.X`
- [ ] Restart app to trigger check
- [ ] Check logs in dev mode: `npm run dev`

### Installation Fails

- [ ] Close app before installing
- [ ] Disable antivirus temporarily
- [ ] Run installer as administrator
- [ ] Check disk space (need ~500MB free)

---

## Success Criteria

Once complete, your app should have:

✅ **Auto-Update System**

- [ ] Professional notifications
- [ ] Progress tracking
- [ ] Error handling

✅ **GitHub Integration**

- [ ] Releases published automatically
- [ ] Users can download installers
- [ ] Update checks work

✅ **Documentation**

- [ ] Setup guide complete
- [ ] Team knows how to use it
- [ ] Future developers can maintain it

✅ **Testing**

- [ ] Update detection works
- [ ] Download completes
- [ ] Installation succeeds
- [ ] New version launches

---

## Ongoing Maintenance

For future versions:

### For Each Update:

1. [ ] Update version in `package.json` (e.g., 0.2.0)
2. [ ] Make your code changes
3. [ ] Run `npm run dist`
4. [ ] Create GitHub Release with new tag
5. [ ] Upload new .exe
6. [ ] Publish release

### Regular Tasks:

- [ ] Monitor update adoption (GitHub release downloads)
- [ ] Keep token secure (never commit to git)
- [ ] Archive old versions (keep at least 2 previous)
- [ ] Monitor error reports from users
- [ ] Test new versions locally before releasing

---

## Quick Reference Commands

```powershell
# Set environment variable (one time)
[Environment]::SetEnvironmentVariable("GH_TOKEN", "your_token", "User")

# Verify token is set
echo $env:GH_TOKEN

# Install dependencies
npm install

# Test locally
npm run dev

# Build for release
npm run dist

# View dist files
ls dist/
```

---

## Resources

- 📖 **Full Guide**: `AUTO_UPDATE_GUIDE.md`
- 🚀 **Quick Start**: `QUICK_START_UPDATES.md`
- 🏗️ **Code Structure**: `CODE_STRUCTURE.md`
- 🔗 **GitHub Releases**: https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository
- 🔗 **electron-updater**: https://www.electron.build/auto-update

---

## Checklist Summary

| Phase             | Tasks   | Time   | Status |
| ----------------- | ------- | ------ | ------ |
| 1. Configuration  | 3 tasks | 5 min  |        |
| 2. GitHub Setup   | 3 tasks | 10 min |        |
| 3. Build & Test   | 4 tasks | 10 min |        |
| 4. Create Release | 4 tasks | 5 min  |        |
| 5. Test Update    | 4 tasks | 10 min |        |
| 6. Documentation  | 3 tasks | 2 min  |        |
| 7. Production     | 4 tasks | 5 min  |        |

**Total Time: ~47 minutes** ⏱️

---

## Support

If something doesn't work:

1. Check `AUTO_UPDATE_GUIDE.md` - Troubleshooting section
2. Check `CODE_STRUCTURE.md` - Understanding the system
3. Check electron-updater docs: https://www.electron.build/auto-update

**You've got this!** 🚀

---

Last Updated: December 22, 2025
Print this page and check off boxes as you complete each step!
