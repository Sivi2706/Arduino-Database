// Firebase libraries
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "YOUR_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID"
};

// Start Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);


// --------------------
// SERVO CONTROL
// --------------------

const slider = document.getElementById("angleSlider");
const angleText = document.getElementById("angleValue");

// when slider moves
slider.addEventListener("input", function(){

  let angle = slider.value;

  // show value on screen
  angleText.innerText = angle;

  // send value to Firebase
  set(ref(database, "servo/angle"), angle);

});


// --------------------
// IR SENSOR
// --------------------

const irValueText = document.getElementById("irValue");
const irDetectedText = document.getElementById("irDetected");

// read sensor value from Firebase
const irRef = ref(database, "sensor/obstacle");

onValue(irRef, function(snapshot){

  let value = snapshot.val();

  irValueText.innerText = value;

  if(value == 0){
    irDetectedText.innerText = "YES";
    irDetectedText.style.color = "red";
  }
  else{
    irDetectedText.innerText = "NO";
    irDetectedText.style.color = "green";
  }

});