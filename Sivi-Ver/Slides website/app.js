
/* ============================================
   IMPORT FIREBASE LIBRARIES 
============================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { getDatabase, ref, onValue, set }
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";


/* ============================================
   FIREBASE CONFIGURATION
   REPLACE WITH YOUR OWN PROJECT SETTINGS
============================================ */

const firebaseConfig = {
  apiKey: "AIzaSyBlxLdiakI8Zv5gtRWtAcfwxTcW-XtGbTw",
  authDomain: "sivi-arduino-database.firebaseapp.com",
  databaseURL: "https://sivi-arduino-database-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sivi-arduino-database",
  storageBucket: "sivi-arduino-database.firebasestorage.app",
  messagingSenderId: "854752663108",
  appId: "1:854752663108:web:b80bad680b96bb63478e11",
  measurementId: "G-C1XE1J4ZJR"
};


/* ============================================
   INITIALIZE FIREBASE
============================================ */

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getDatabase(app);


/* ============================================
   GET HTML ELEMENTS
============================================ */

const statusEl    = document.getElementById("status");

const angleSlider = document.getElementById("angleSlider");

const angleValue  = document.getElementById("angleValue");

const servoAngle  = document.getElementById("servoAngle");

const irDetected  = document.getElementById("irDetected");

const irRaw       = document.getElementById("irRaw");

const messages    = document.getElementById("messages");

const msgInput    = document.getElementById("msgInput");

const sendBtn     = document.getElementById("sendBtn");


let lastEspMsg = "";


/* ============================================
   FUNCTION: DISPLAY MESSAGE
============================================ */

function addMessage(text, source) {

  if (messages.textContent === "No messages yet.") {
    messages.textContent = "";
  }

  messages.textContent += `[${source}] ${text}\n`;

  messages.scrollTop = messages.scrollHeight;

}


/* ============================================
   FUNCTION: SEND MESSAGE FROM WEB
============================================ */

function sendWebMessage() {

  const text = msgInput.value.trim();

  if (!text) return;

  addMessage(text, "Web");

  msgInput.value = "";

  set(ref(db, "serial/message"), {

    text: text,

    source: "web"

  });

}


/* ============================================
   SERVO SLIDER CONTROL
   Path: "servo/msgTitle" — matches .ino beginStream path
============================================ */

angleSlider.addEventListener("input", () => {

  const angle = Number(angleSlider.value);

  angleValue.textContent = angle;

  // Write value to Firebase — matches .ino: Firebase.RTDB.beginStream(&fbdoStream, "servo/msgTitle")
  set(ref(db, "servo/msgTitle"), angle);

});


/* ============================================
   BUTTON EVENTS
============================================ */

sendBtn.addEventListener("click", sendWebMessage);

msgInput.addEventListener("keydown", (e) => {

  if (e.key === "Enter") {

    sendWebMessage();

  }

});


/* ============================================
   LOGIN TO FIREBASE
============================================ */

signInAnonymously(auth).catch(err => {

  console.error(err);

  statusEl.textContent = "Auth failed";

});


/* ============================================
   AFTER LOGIN
============================================ */

onAuthStateChanged(auth, (user) => {

  if (!user) {

    statusEl.textContent = "Connecting...";

    return;

  }

  statusEl.textContent = "Connected";


  /* -----------------------------------------
     SERVO DATA
     Path: "servo/msgTitle" — matches .ino beginStream path
  ----------------------------------------- */

  onValue(ref(db, "servo/msgTitle"), (snap) => {

    const val = snap.val();

    if (val === null) return;

    angleSlider.value = val;

    angleValue.textContent = val;

    servoAngle.textContent = val;

  });


  /* -----------------------------------------
     IR SENSOR DATA
     Path: "sensor/obstacle" — matches .ino: Firebase.RTDB.setInt(&fbdoSet, "sensor/obstacle", status)
     Value: 0 = object detected, 1 = clear
  ----------------------------------------- */

  onValue(ref(db, "sensor/obstacle"), (snap) => {

    const val = snap.val();

    if (val === null) return;

    // 0 = Object detected, 1 = Clear (digitalRead behaviour)
    irRaw.textContent = val;

    irDetected.textContent = val === 0 ? "YES" : "NO";

  });


  /* -----------------------------------------
     MESSAGE FROM ESP32
  ----------------------------------------- */

  onValue(ref(db, "serial/message"), (snap) => {

    const data = snap.val();

    if (!data || !data.text) return;

    if (data.source === "esp32" && data.text !== lastEspMsg) {

      lastEspMsg = data.text;

      addMessage(data.text, "ESP32");

    }

  });

});