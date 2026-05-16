import * as admin from "firebase-admin";
import { getFirebaseAppOptions } from "./env.config";

if (!admin.apps.length) {
	admin.initializeApp(getFirebaseAppOptions());
}

export const firestore = admin.firestore();
firestore.settings({ignoreUndefinedProperties: true});

export const firebaseApp = admin.app();

export const getRealtimeDb = () => admin.database();
