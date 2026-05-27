import * as admin from "firebase-admin";
import {getFirebaseAppOptions} from "./env.config";

if (!admin.apps.length) {
  admin.initializeApp({credential: admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS as string)});
}

export const firestore = admin.firestore();
firestore.settings({ignoreUndefinedProperties: true});

export const firebaseApp = admin.app();

export const getRealtimeDb = () => admin.database();
