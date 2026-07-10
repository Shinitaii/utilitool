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

## Security: Network Security Config (required after a fresh `npx cap add android`)

The `android/` directory is git-ignored and regenerated locally, so this step must be repeated
whenever the Android project is recreated from scratch:

1. Create `android/app/src/main/res/xml/network_security_config.xml`:
   ```xml
   <?xml version="1.0" encoding="utf-8"?>
   <network-security-config>
       <base-config cleartextTrafficPermitted="false">
           <trust-anchors>
               <certificates src="system" />
           </trust-anchors>
       </base-config>
   </network-security-config>
   ```
2. Add `android:networkSecurityConfig="@xml/network_security_config"` to the `<application>` tag
   in `android/app/src/main/AndroidManifest.xml`.

This explicitly denies cleartext (`http://`) traffic app-wide, rather than relying on the Android
API-level default. Pairs with the build-time HTTPS guard in `src/lib/api/client.ts`.
