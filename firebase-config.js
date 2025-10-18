// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAr_S6URDXWbjQ4Gh0Nw_JOeTkHA_G8Uis",
    authDomain: "cloud-casino-34cc6.firebaseapp.com",
    projectId: "cloud-casino-34cc6",
    storageBucket: "cloud-casino-34cc6.firebasestorage.app",
    messagingSenderId: "289867400095",
    appId: "1:289867400095:web:c9060c2a534225db9cf3aa"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();
const functions = firebase.functions();
