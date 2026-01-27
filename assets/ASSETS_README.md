# Karuna App Assets

This directory should contain the following image assets for the mobile app:

## Required Assets

| File | Size | Description |
|------|------|-------------|
| `icon.png` | 1024x1024 | App icon (iOS & Android) |
| `splash.png` | 1284x2778 | Splash screen image |
| `adaptive-icon.png` | 1024x1024 | Android adaptive icon foreground |
| `favicon.png` | 48x48 | Web favicon |
| `notification-icon.png` | 96x96 | Android notification icon (white on transparent) |

## Optional Assets

| File | Description |
|------|-------------|
| `notification-sound.wav` | Custom notification sound |

## Generating Placeholder Assets

Run the following command to generate placeholder assets for development:

```bash
node scripts/generate-assets.js
```

## Design Guidelines

### Icon (icon.png)
- 1024x1024 pixels, PNG format
- No transparency (add solid background)
- Leave padding around the logo (about 20%)
- Use the brand purple (#4F46E5) as background

### Splash Screen (splash.png)
- 1284x2778 pixels (iPhone 14 Pro Max resolution)
- Center the logo in the middle
- Use brand purple (#4F46E5) as background
- Keep important content in the center 40% to avoid cropping

### Adaptive Icon (adaptive-icon.png)
- 1024x1024 pixels, PNG format
- Only the foreground layer (logo/icon)
- Transparent background (the app.json defines background color)
- Keep safe zone: content should be within center 66%

### Notification Icon (notification-icon.png)
- 96x96 pixels, PNG format
- White silhouette on transparent background
- Simple shape that's recognizable at small sizes
