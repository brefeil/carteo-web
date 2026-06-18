import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB__SZWm13DTn-X8Xx9cC77k7ztyM5vBTQ",
  authDomain: "carteo-d0fa9.firebaseapp.com",
  projectId: "carteo-d0fa9",
  storageBucket: "carteo-d0fa9.firebasestorage.app",
  messagingSenderId: "457743456962",
  appId: "1:457743456962:web:febf3896cac183d0bcf95b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
export { app, db };