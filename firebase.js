import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// TODO: Replace with your real Firebase config (DO NOT commit secrets)
// Option A: allow read/write for quick MVP (not secure)
// Option B: recommended — use Firebase Auth (anonymous or email) and restrict writes in Firestore Security Rules.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

function isConfigReady(cfg){
  return cfg && Object.values(cfg).every(v=> v && !String(v).includes("YOUR_"));
}

let db = null;
let firebaseReady = false;

if(isConfigReady(firebaseConfig)){
  try{
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    firebaseReady = true;
  }catch(err){
    console.warn("Firebase init failed; using local mode", err);
    db = null;
    firebaseReady = false;
  }
}

export { db, firebaseReady, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc };
