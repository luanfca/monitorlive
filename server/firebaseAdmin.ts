import admin from 'firebase-admin';

// Initialize Firebase Admin using the environment variable
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

if (serviceAccountJson && !admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin initialized successfully.');
  } catch (error) {
    console.error('Error parsing FIREBASE_SERVICE_ACCOUNT:', error);
  }
} else if (!serviceAccountJson) {
  console.warn('FIREBASE_SERVICE_ACCOUNT environment variable is not set. Push notifications will not work.');
}

export const messaging = admin.apps.length ? admin.messaging() : null;
