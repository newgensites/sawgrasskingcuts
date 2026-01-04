import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSy....",
  authDomain: "sawgrass-king-cuts.firebaseapp.com",
  projectId: "sawgrass-king-cuts",
  storageBucket: "sawgrass-king-cuts.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
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
  db,
  firebaseReady,
  isFirebaseReady,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
};
