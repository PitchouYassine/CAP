import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

let app = null;
let db = null;
let auth = null;

try {
  if (firebaseConfig && firebaseConfig.apiKey) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    db = firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);
    auth = getAuth(app);
  }
} catch (err) {
  console.warn("[Firebase] Initialization notice:", err?.message || err);
}

export { app, db, auth };

export async function testConnection() {
  if (!db) return false;
  try {
    await getDocFromServer(doc(db, "settings", "production_settings"));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
    return false;
  }
}

testConnection();

