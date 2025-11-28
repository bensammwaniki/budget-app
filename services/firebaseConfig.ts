// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For now, we use placeholders. You will need to replace these with your actual config.
const firebaseConfig = {
  apiKey: "AIzaSyBQErt5PmWccStVtADjSOzvcYU8pLKezno",
  authDomain: "fanga-budget.firebaseapp.com",
  projectId: "fanga-budget",
  storageBucket: "fanga-budget.firebasestorage.app",
  messagingSenderId: "638697871062",
  appId: "1:638697871062:web:2a3933770ae6f92e275b77",
  measurementId: "G-DY9MBH79TQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
