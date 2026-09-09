// Firebase configuration for Techno Minds Platform.
// These web identifiers are public. Protection is provided by Authentication,
// Firestore/Storage Rules and Cloud Functions. App Check/reCAPTCHA are not used.
window.MF_FIREBASE_CONFIG = {
  enabled: true,
  apiKey: "AIzaSyDfV7heZtckswPx0GINff2cWvxG9Lj8vg8",
  authDomain: "eng-amr-khaled-academy.firebaseapp.com",
  projectId: "eng-amr-khaled-academy",
  storageBucket: "eng-amr-khaled-academy.firebasestorage.app",
  messagingSenderId: "162216637616",
  appId: "1:162216637616:web:23048188094bba8cdd7775",
  measurementId: "G-XWKWPWJN6W",
  functionsRegion: "europe-west1",
  // Paste the Firebase Console > Cloud Messaging > Web Push public VAPID key
  // here to receive booking notifications while the teacher app is closed.
  messagingVapidKey: "BMx64MqhFTphH9EMdwXP3aSXGyTvDdEcb8a9tTEISI-s-qr3B6-jaTL9g1TurKmFyldod2kd6ms43PBq_OVSQpI",
  useSecureFunctions: true
};
