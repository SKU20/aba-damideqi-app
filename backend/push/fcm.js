// backend/push/fcm.js
import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load service account (do NOT commit this file)
const serviceAccount = await import(
  path.join(__dirname, '..', 'keys', 'firebase-service-account.json'),
  { assert: { type: 'json' } }
).then(m => m.default);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export async function sendFcmToDevice(fcmToken, payload) {
  // payload example: { notification: { title: 'Test', body: 'Hello' }, data: { type: 'chat' } }
  return admin.messaging().sendToDevice(fcmToken, payload, { priority: 'high' });
}