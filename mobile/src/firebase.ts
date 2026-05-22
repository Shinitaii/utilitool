import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDNgMZhU-YfJLvZD5KvhZSmWFvXQGJ_3Rs',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'utilitool-staging.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'utilitool-staging',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'utilitool-staging.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '482193090076',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:482193090076:web:a1b2c3d4e5f6g7h8i9j0k1l2m3'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
