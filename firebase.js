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

const firebaseConfig = {
  apiKey: "AIzaSy....",
  authDomain: "sawgrass-king-cuts.firebaseapp.com",
  projectId: "sawgrass-king-cuts",
  storageBucket: "sawgrass-king-cuts.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
};

let db = null;
let firebaseReady = false;

try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  firebaseReady = true;
} catch (err) {
  console.warn("Firebase init failed; using local mode", err);
  db = null;
  firebaseReady = false;
}

function isFirebaseReady() {
  return firebaseReady && !!db;
}

export {
  addDoc,
  collection,
  db,
  deleteDoc,
  doc,
  isFirebaseReady,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
};
