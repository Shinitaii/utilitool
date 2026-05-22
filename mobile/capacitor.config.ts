import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.utilitool.mobile',
  appName: 'Utilitool Mobile',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Camera: {
      saveToGallery: false,
      promptForCameraPermission: true
    }
  }
};

export default config;
