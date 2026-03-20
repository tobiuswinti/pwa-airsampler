// ── Firebase configuration ──────────────────────────────────────────────────
// Replace the placeholder values below with your Firebase project config.
// You can find these in the Firebase Console → Project Settings → Your apps.

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAkXe1teLRU-1GclS-tBr00QfcUPWph5EI",
  authDomain: "pwa-ba-airsampler.firebaseapp.com",
  projectId: "pwa-ba-airsampler",
  storageBucket: "pwa-ba-airsampler.firebasestorage.app",
  messagingSenderId: "970351873737",
  appId: "1:970351873737:web:bc5e76ddd4a01c6ff18718",
  measurementId: "G-0ZRKY2P364"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
