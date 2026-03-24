/* ============================================
   PART 1: IMPORT FIREBASE LIBRARIES
============================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { getDatabase, ref, onValue, set }
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";


/* ============================================
   PART 2: FIREBASE CONFIGURATION
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
   PART 3: GET HTML ELEMENTS
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
PART 4   : Serial Display
============================================ */

// FUNCTION: DISPLAY MESSAGE
function addMessage(text, source) {
  if (messages.textContent === "No messages yet.") {
    messages.textContent = "";
  }
  messages.textContent += `[${source}] ${text}\n`;
  messages.scrollTop = messages.scrollHeight;
}


// FUNCTION: SEND MESSAGE FROM WEB
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
   PART 5: SERVO SLIDER CONTROL Listener
============================================ */

angleSlider.addEventListener("input", () => {
  const angle = Number(angleSlider.value);
  angleValue.textContent = angle;
  set(ref(db, "servo/msgTitle"), angle);
});

/* ============================================
   PART 6: Sen button Listener
============================================ */
// BUTTON EVENTS
sendBtn.addEventListener("click", sendWebMessage);
msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendWebMessage();
  }
});


/* ============================================
   PART 7: Listen for Changes from Firebase
============================================ */

// LOGIN TO FIREBASE
signInAnonymously(auth).catch(err => {
  console.error(err)
  statusEl.textContent = "Auth failed";
});

// AFTER LOGIN - ATTACH REAL-TIME LISTENERS
onAuthStateChanged(auth, (user) => {
  if (!user) {
    statusEl.textContent = "Connecting...";
    return;
  }
  statusEl.textContent = "Connected";

  /* ----- SERVO LISTENER ----- */
  onValue(ref(db, "servo/msgTitle"), (snap) => {
    const val = snap.val();
    if (val === null) return;
    angleSlider.value = val;
    angleValue.textContent = val;
    servoAngle.textContent = val;
  });

  /* ----- IR SENSOR LISTENER ----- */
  onValue(ref(db, "sensor/obstacle"), (snap) => {
    const val = snap.val();
    if (val === null) return;
    irRaw.textContent = val;
    irDetected.textContent = val === 0 ? "YES" : "NO";
  });

  /* ----- MESSAGE LISTENER ----- */
  onValue(ref(db, "serial/message"), (snap) => {
    const data = snap.val();
    if (!data || !data.text) return;
    if (data.source === "esp32" && data.text !== lastEspMsg) {
      lastEspMsg = data.text;
      addMessage(data.text, "ESP32");
    }
  });
});