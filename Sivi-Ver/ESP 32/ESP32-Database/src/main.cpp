/*
 * ESP32 Firebase — Working Version
 * Uses database secret (legacy token) — no email/password needed.
 * This is the most reliable method for Firebase_ESP_Client on ESP32.
 *
 * SETUP STEPS in Firebase Console:
 *   1. Project Settings → Service accounts → Database secrets
 *      → Show → copy the secret string → paste below as DATABASE_SECRET
 *   2. Realtime Database → Rules → set to:
 *      { "rules": { ".read": true, ".write": true } }
 *      (you can tighten this later once everything works)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>
#include <ESP32Servo.h>

// ── Wi-Fi ─────────────────────────────────────────────────────────
#define WIFI_SSID     "Xiaomi"
#define WIFI_PASSWORD "G2706pls"

// ── Firebase ──────────────────────────────────────────────────────
// Get DATABASE_SECRET from:
//   Firebase Console → Project Settings (gear icon)
//   → Service accounts tab → Database secrets → Show
#define FIREBASE_DATABASE_URL "https://sivi-arduino-database-default-rtdb.asia-southeast1.firebasedatabase.app"
#define DATABASE_SECRET       "PASTE_YOUR_DATABASE_SECRET_HERE"

// ── Pin definitions ───────────────────────────────────────────────
#define SERVO_PIN 13
#define IR_PIN    34

// ── Upload intervals ──────────────────────────────────────────────
#define IR_UPLOAD_INTERVAL_MS     500
#define SERIAL_UPLOAD_INTERVAL_MS 1000

// ── Firebase objects ──────────────────────────────────────────────
FirebaseData fbStream;
FirebaseData fbWrite;
FirebaseData fbSerialWrite;
FirebaseAuth fbAuth;
FirebaseConfig fbConfig;

// ── Globals ───────────────────────────────────────────────────────
Servo servo;
int  currentAngle      = 90;
bool streamReady       = false;
volatile bool newAngleAvailable = false;
volatile int  pendingAngle      = 90;
unsigned long lastIrUpload      = 0;
unsigned long lastSerialUpload  = 0;
unsigned long lastFirebaseCheck = 0;
String serialBuffer = "";


// ─────────────────────────────────────────────────────────────────
// STREAM CALLBACKS
// ─────────────────────────────────────────────────────────────────

void streamCallback(FirebaseStream data) {
  Serial.print("Stream event — dataType: ");
  Serial.println(data.dataType());

  String dtype = data.dataType();
  if (dtype == "int" || dtype == "float" || dtype == "number") {
    int angle = data.intData();
    angle = constrain(angle, 0, 180);
    pendingAngle      = angle;
    newAngleAvailable = true;
  }
}

void streamTimeoutCallback(bool timeout) {
  if (timeout) {
    Serial.println("Stream timeout — reconnecting...");
    streamReady = false;
  }
}


// ─────────────────────────────────────────────────────────────────
// WI-FI
// ─────────────────────────────────────────────────────────────────

void connectWiFi() {
  Serial.print("Connecting to Wi-Fi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 60) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("Connected — IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi failed. Rebooting...");
    delay(2000);
    ESP.restart();
  }
}


// ─────────────────────────────────────────────────────────────────
// SERIAL → FIREBASE
//   /serial/latest   — overwritten each time (web reads this live)
//   /serial/log/<ts> — append-only history for scrollback
// ─────────────────────────────────────────────────────────────────

void sendSerialToFirebase(const String& message) {
  if (message.length() == 0 || !Firebase.ready()) return;

  int ts = (int)millis();

  // 1. Overwrite /serial/latest
  FirebaseJson latestJson;
  latestJson.set("text",      message);
  latestJson.set("timestamp", ts);
  latestJson.set("source",    "esp32");

  if (Firebase.RTDB.setJSON(&fbSerialWrite, "/serial/latest", &latestJson)) {
    Serial.println("Serial → /serial/latest OK");
  } else {
    Serial.print("Serial latest error: ");
    Serial.println(fbSerialWrite.errorReason());
  }

  // 2. Append to /serial/log/<timestamp> for history
  FirebaseJson logJson;
  logJson.set("text",      message);
  logJson.set("timestamp", ts);

  String logPath = "/serial/log/";
  logPath += String(ts);

  if (Firebase.RTDB.setJSON(&fbSerialWrite, logPath.c_str(), &logJson)) {
    Serial.println("Serial → /serial/log OK");
  } else {
    Serial.print("Serial log error: ");
    Serial.println(fbSerialWrite.errorReason());
  }
}


// ─────────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\nESP32 Starting...");

  pinMode(IR_PIN, INPUT_PULLUP);
  servo.attach(SERVO_PIN, 500, 2400);
  servo.write(currentAngle);

  connectWiFi();

  // ── Firebase config using legacy database secret ──────────────
  // This bypasses the token auth system entirely — most reliable
  // method for Firebase_ESP_Client without email/password accounts.
  fbConfig.database_url = FIREBASE_DATABASE_URL;
  fbConfig.signer.tokens.legacy_token = DATABASE_SECRET;

  fbConfig.timeout.serverResponse   = 10000;
  fbConfig.timeout.socketConnection = 30000;

  fbWrite.setResponseSize(2048);
  fbSerialWrite.setResponseSize(2048);
  fbStream.setResponseSize(2048);

  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);

  Serial.println("Firebase initialised with legacy token.");
  serialBuffer = "ESP32 Started — System Ready";
}


// ─────────────────────────────────────────────────────────────────
// LOOP
// ─────────────────────────────────────────────────────────────────

void loop() {

  // WiFi watchdog
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost. Reconnecting...");
    connectWiFi();
    delay(1000);
    return;
  }

  unsigned long now = millis();

  // Wait for Firebase to be ready
  if (!Firebase.ready()) {
    if (now - lastFirebaseCheck > 3000) {
      Serial.println("Waiting for Firebase...");
      lastFirebaseCheck = now;
    }
    delay(100);
    return;
  }

  // Start RTDB stream once ready
  if (!streamReady) {
    Serial.println("Starting stream on /servo/angle...");
    if (Firebase.RTDB.beginStream(&fbStream, "/servo/angle")) {
      Firebase.RTDB.setStreamCallback(&fbStream, streamCallback, streamTimeoutCallback);
      streamReady = true;
      Serial.println("Stream started.");

      if (Firebase.RTDB.setInt(&fbWrite, "/servo/angle", currentAngle)) {
        Serial.println("Initial servo position written.");
      } else {
        Serial.print("Initial write error: ");
        Serial.println(fbWrite.errorReason());
      }
    } else {
      Serial.print("Stream error: ");
      Serial.println(fbStream.errorReason());
      delay(2000);
      return;
    }
  }

  // Apply angle from stream
  if (newAngleAvailable) {
    newAngleAvailable = false;
    currentAngle = pendingAngle;
    servo.write(currentAngle);
    Serial.printf("Servo → %d°\n", currentAngle);

    if (serialBuffer.length() > 0) serialBuffer += "\n";
    serialBuffer += "Servo moved to ";
    serialBuffer += String(currentAngle);
    serialBuffer += "°";
  }

  // Handle Serial input from PC
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    if (input.length() > 0) {
      if (serialBuffer.length() > 0) serialBuffer += "\n";
      serialBuffer += "> ";
      serialBuffer += input;

      if (input.equalsIgnoreCase("/status")) {
        serialBuffer += "\nServo: ";
        serialBuffer += String(currentAngle);
        serialBuffer += "° | IR: ";
        serialBuffer += String(digitalRead(IR_PIN));
        serialBuffer += "\nIP: ";
        serialBuffer += WiFi.localIP().toString();
        serialBuffer += "\nFirebase: ";
        serialBuffer += String(Firebase.ready() ? "Ready" : "Not ready");
      }
    }
  }

  // ── Serial upload ─────────────────────────────────────────────
  if (now - lastSerialUpload >= SERIAL_UPLOAD_INTERVAL_MS) {
    lastSerialUpload = now;

    // Heartbeat when idle
    if (serialBuffer.length() == 0) {
      serialBuffer  = "[heartbeat] uptime: ";
      serialBuffer += String(now / 1000);
      serialBuffer += "s | servo: ";
      serialBuffer += String(currentAngle);
      serialBuffer += "° | IR: ";
      serialBuffer += String(digitalRead(IR_PIN) == LOW ? "detected" : "clear");
    }

    sendSerialToFirebase(serialBuffer);
    serialBuffer = "";
  }

  // ── IR sensor upload ──────────────────────────────────────────
  if (now - lastIrUpload >= IR_UPLOAD_INTERVAL_MS) {
    lastIrUpload = now;

    int  irRaw    = digitalRead(IR_PIN);
    bool detected = (irRaw == LOW);

    FirebaseJson irJson;
    irJson.set("raw",       irRaw);
    irJson.set("detected",  detected);
    irJson.set("timestamp", (int)now);

    if (Firebase.RTDB.setJSON(&fbWrite, "/ir", &irJson)) {
      Serial.printf("IR — raw: %d, detected: %s\n",
                    irRaw, detected ? "YES" : "NO");
    } else {
      Serial.print("IR upload error: ");
      Serial.println(fbWrite.errorReason());
    }
  }
}