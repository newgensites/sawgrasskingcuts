import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// -------------------------------------------------------------
// Placeholder config — replace ALL values with your real keys.
// -------------------------------------------------------------
const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID",
};

function hasRealConfig(cfg) {
  if (!cfg) return false;
  return Object.values(cfg).every((val) => typeof val === "string" && val && !val.startsWith("REPLACE_WITH_"));
}

let app = null;
let db = null;
let firebaseReady = false;

function initFirebase() {
  if (firebaseReady || db) return db;
  if (!hasRealConfig(firebaseConfig)) return null;

  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    firebaseReady = true;
  } catch (err) {
    console.warn("Firebase init failed; using local mode", err);
    db = null;
    firebaseReady = false;
  }

  return db;
}

initFirebase();

function isFirebaseReady() {
  return firebaseReady && !!db;
}

export {
  addDoc,
  db,
  firebaseReady,
  isFirebaseReady,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
};
