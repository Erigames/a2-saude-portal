// js/config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBSl6vWiBDgE2chdREHu_qvffjOd7nXSJ8",
    authDomain: "a2-saude-portal.firebaseapp.com",
    projectId: "a2-saude-portal",
    storageBucket: "a2-saude-portal.firebasestorage.app",
    messagingSenderId: "106692196653",
    appId: "1:106692196653:web:d0f784dbcf609a50123ba4"
};

// Inicializa e exporta para os outros arquivos
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);