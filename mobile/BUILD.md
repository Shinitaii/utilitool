# Building the Capacitor Mobile App

## Prerequisites
- Node.js 18+
- Android SDK (API 30+)
- Android Studio (optional, for emulator)

## Development
```bash
npm run dev        # Start dev server (http://localhost:5174)
npm run build      # Build for production
npx cap sync       # Sync web assets to native platforms
npx cap open android  # Open Android Studio
```

## Android Build
1. Open Android Studio via `npx cap open android`
2. Build → Make Project
3. Run → Run 'app'

## Testing
- Use Android emulator or physical device
- Enable USB debugging on physical device
- Connect via `adb devices`
