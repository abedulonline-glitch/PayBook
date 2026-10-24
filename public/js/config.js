// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD0j438UHEozebvHUnoJK58-YT3Sv4JbQQ",
  authDomain: "paybook-cc6be.firebaseapp.com",
  projectId: "paybook-cc6be",
  storageBucket: "paybook-cc6be.firebasestorage.app",
  messagingSenderId: "1000801647538",
  appId: "1:1000801647538:web:648ac804d8d75a0811c2ab",
  measurementId: "G-TFX1Y6FH29"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
