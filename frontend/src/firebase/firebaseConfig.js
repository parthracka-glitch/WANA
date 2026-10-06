// firebaseConfig.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCtqWqS1mjKpQ3wiKNgNkY4SlUsFBRIW9I",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "wana-9705e.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "wana-9705e",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "wana-9705e.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "873274374868",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:873274374868:web:d187289ed3652ecd979941",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-BS5B2J5X7J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Named exports
export const auth = getAuth(app);
export const db = getFirestore(app);

// Default export
export default firebaseConfig;
