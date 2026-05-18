#!/usr/bin/env node

/**
 * Firebase Emulator Seed Script
 * Creates an admin user (admin@test.com / password123) in the emulator
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin with emulator configuration
const serviceAccountPath = path.join(__dirname, 'secrets/service-account-key.json');
let serviceAccount = null;

try {
  serviceAccount = require(serviceAccountPath);
} catch (e) {
  console.warn('Service account key not found, using default credentials');
  serviceAccount = {
    projectId: 'utilitool-test',
    privateKey: 'dummy-key',
    clientEmail: 'dummy@utilitool-test.iam.gserviceaccount.com'
  };
}

admin.initializeApp({
  projectId: 'utilitool-test',
  credential: admin.credential.cert(serviceAccount)
});

// Connect to emulator (must be done AFTER app init)
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'firebase-emulator:9099';
process.env.FIRESTORE_EMULATOR_HOST = 'firebase-emulator:8080';

const auth = admin.auth();
const db = admin.firestore();

const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASSWORD = 'password123';
const ADMIN_DISPLAY_NAME = 'Admin User';

async function waitForEmulator(maxRetries = 30, delayMs = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await db.collection('_health_check').doc('test').set({ timestamp: new Date() }, { merge: true });
      console.log('✓ Emulator is healthy');
      return;
    } catch (error) {
      console.log(`Waiting for emulator... (attempt ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Emulator failed to become healthy after 30 attempts');
}

async function seedDatabase() {
  try {
    console.log('🌱 Starting Firebase Emulator seed...');

    // Wait for emulator to be ready
    await waitForEmulator();

    // Check if admin user already exists
    let adminUser = null;
    try {
      adminUser = await auth.getUserByEmail(ADMIN_EMAIL);
      console.log(`✓ Admin user already exists: ${ADMIN_EMAIL}`);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }

      // Create auth user
      console.log(`Creating admin user: ${ADMIN_EMAIL}`);
      adminUser = await auth.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        displayName: ADMIN_DISPLAY_NAME,
        disabled: false
      });
      console.log(`✓ Admin user created with uid: ${adminUser.uid}`);
    }

    // Create/update user document in Firestore
    const userRef = db.collection('users').doc(adminUser.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log('Creating user document in Firestore...');
      await userRef.set({
        id: adminUser.uid,
        email: ADMIN_EMAIL,
        display_name: ADMIN_DISPLAY_NAME,
        role: 'admin',
        created_at: new Date(),
        updated_at: new Date()
      });
      console.log(`✓ User document created for uid: ${adminUser.uid}`);
    } else {
      console.log(`✓ User document already exists for uid: ${adminUser.uid}`);
      // Optionally update to ensure role is admin
      await userRef.update({
        role: 'admin',
        updated_at: new Date()
      });
      console.log(`✓ User document updated to role: admin`);
    }

    console.log('\n✅ Seed completed successfully!');
    console.log(`Admin credentials:\n  Email: ${ADMIN_EMAIL}\n  Password: ${ADMIN_PASSWORD}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seedDatabase();
