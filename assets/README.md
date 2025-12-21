# Assets Directory

Place application icons here:

- `icon.ico` — Windows application icon (256×256 or larger)

## Creating the Icon

1. **From PNG**:

   - Create a 256×256 PNG image
   - Convert to `.ico` format using:
     - Online tool: https://convertio.co/png-ico/
     - ImageMagick: `convert icon.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico`
     - PowerShell: (requires third-party tool)

2. **Recommended Tools**:

   - IcoFX (free)
   - Greenfish Icon Editor Pro
   - Online: convertio.co, online-convert.com

3. **Save**:
   - Place as `assets/icon.ico` in the project root

The icon will be used in:

- Windows installer (NSIS)
- App shortcut
- Start Menu entry
- Control Panel → Programs list

If `icon.ico` is not present, the build will use a generic Electron icon.

---

Example placeholder icon command (if you have ImageMagick installed):

```bash
# Create a simple 256x256 icon from a PNG
convert input.png -resize 256x256 icon.ico
```
