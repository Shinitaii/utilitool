import { browser } from '$app/environment';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getAuth, type Auth } from 'firebase/auth';

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
}

export { app, storage, auth };
