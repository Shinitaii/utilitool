import { browser } from '$app/environment';
import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyARyG7a-_iElSs7yMj8NuFgYtPWPKVQxR0',
  authDomain: 'utilitool-staging.firebaseapp.com',
  projectId: 'utilitool-staging',
  storageBucket: 'utilitool-staging.appspot.com',
  messagingSenderId: '174182910662',
  appId: '1:174182910662:web:8d557f533b186b4b8e65c7',
};

let app: any;
let storage: any;
let auth: any;

if (browser) {
  app = initializeApp(firebaseConfig);
  storage = getStorage(app);
  auth = getAuth(app);
}

export { app, storage, auth };
