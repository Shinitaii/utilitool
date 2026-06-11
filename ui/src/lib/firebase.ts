import { browser } from '$app/environment';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Definite assignment: these are only accessed in browser context where they are always initialized
let app!: FirebaseApp;
let storage!: FirebaseStorage;
let auth!: Auth;

if (browser) {
  app = initializeApp(firebaseConfig);
  storage = getStorage(app);
  auth = getAuth(app);

  // E2E tests only (decisions/20260611_emulator-for-e2e-testing.md): point the SDK at the
  // local Firebase emulators instead of the real project.
  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }
}

export { app, storage, auth };
