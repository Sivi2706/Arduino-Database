/*
 * ESP32 Firebase — Simplified
 * - No timestamps anywhere
 * - Serial monitor only shows user-typed text
 *   (from Serial Monitor terminal OR from website input box)
 * - Heartbeats removed
 * - Servo via direct LEDC PWM
 */

#include <Arduino.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>

// ── Wi-Fi ─────────────────────────────────────────────────────────
#define WIFI_SSID     "Xiaomi"
#define WIFI_PASSWORD "G2706pls"

// ── Firebase ──────────────────────────────────────────────────────
#define FIREBASE_DATABASE_URL "https://sivi-arduino-database-default-rtdb.asia-southeast1.firebasedatabase.app"
#define DATABASE_SECRET       "PASTE_YOUR_DATABASE_SECRET_HERE"

// ── Servo (LEDC direct PWM) ───────────────────────────────────────
#define SERVO_PIN     13
#define LEDC_CHANNEL  0
#define LEDC_FREQ_HZ  50
#define LEDC_RES_BITS 16
#define SERVO_MIN_US  500
#define SERVO_MAX_US  2500

// ── IR ────────────────────────────────────────────────────────────
#define IR_PIN 34

// ── Intervals ─────────────────────────────────────────────────────
#define POLL_INTERVAL 100
#define IR_INTERVAL   500

// ── Firebase objects ──────────────────────────────────────────────
FirebaseData fbStream;
FirebaseData fbPoll;
FirebaseData fbWrite;
FirebaseAuth fbAuth;
FirebaseConfig fbConfig;

// ── Globals ───────────────────────────────────────────────────────
int  currentAngle = 90;
bool streamReady  = false;

unsigned long lastPoll   = 0;
unsigned long lastIR     = 0;
unsigned long lastFBCheck = 0;


// ─────────────────────────────────────────────────────────────────
// SERVO
// ─────────────────────────────────────────────────────────────────
uint32_t angleToDuty(int angle) {
  angle   = constrain(angle, 0, 180);
  long us = map(angle, 0, 180, SERVO_MIN_US, SERVO_MAX_US);
  return (uint32_t)(us * 65536UL / 20000UL);
}

void applyAngle(int angle) {
  angle = constrain(angle, 0, 180);
  currentAngle = angle;
  ledcWrite(LEDC_CHANNEL, angleToDuty(angle));
  Serial.print("Servo → ");
  Serial.println(currentAngle);
}


// ─────────────────────────────────────────────────────────────────
// STREAM CALLBACKS
// ─────────────────────────────────────────────────────────────────
void streamCallback(FirebaseStream data) {
  String dtype = data.dataType();
  if (dtype == "int" || dtype == "float" || dtype == "number") {
    applyAngle(data.intData());
  }
}

void streamTimeoutCallback(bool timeout) {
  if (timeout) {
    Serial.println("Stream timeout.");
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
    Serial.println("\nWiFi failed. Rebooting...");
    delay(2000);
    ESP.restart();
  }
}


// ─────────────────────────────────────────────────────────────────
// SEND USER MESSAGE → FIREBASE
// Only called when user actually types something.
// Writes to /serial/message — a single string, no timestamp.
// ─────────────────────────────────────────────────────────────────
void sendMessage(const String& text) {
  if (text.length() == 0 || !Firebase.ready()) return;
  // Store as plain string — source tag tells web who sent it
  FirebaseJson j;
  j.set("text",   text);
  j.set("source", "esp32");
  Firebase.RTDB.setJSON(&fbWrite, "/serial/message", &j);
}


// ─────────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\nESP32 Starting...");
  Serial.println("Type anything and press Enter to send to the dashboard.");

  ledcSetup(LEDC_CHANNEL, LEDC_FREQ_HZ, LEDC_RES_BITS);
  ledcAttachPin(SERVO_PIN, LEDC_CHANNEL);
  applyAngle(90);

  pinMode(IR_PIN, INPUT_PULLUP);

  connectWiFi();

  fbConfig.database_url               = FIREBASE_DATABASE_URL;
  fbConfig.signer.tokens.legacy_token = DATABASE_SECRET;
  fbConfig.timeout.serverResponse     = 8000;
  fbConfig.timeout.socketConnection   = 20000;

  fbStream.setResponseSize(4096);
  fbPoll.setResponseSize(512);
  fbWrite.setResponseSize(1024);

  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);

  Serial.println("Firebase ready.");
}


// ─────────────────────────────────────────────────────────────────
// LOOP
// ─────────────────────────────────────────────────────────────────
void loop() {

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost. Reconnecting...");
    connectWiFi();
    streamReady = false;
    delay(1000);
    return;
  }

  unsigned long now = millis();

  if (!Firebase.ready()) {
    if (now - lastFBCheck > 3000) {
      Serial.println("Waiting for Firebase...");
      lastFBCheck = now;
    }
    delay(100);
    return;
  }

  // ── Start / restart stream ────────────────────────────────────
  if (!streamReady) {
    Serial.println("Starting stream...");
    if (Firebase.RTDB.beginStream(&fbStream, "/servo/angle")) {
      Firebase.RTDB.setStreamCallback(
        &fbStream, streamCallback, streamTimeoutCallback);
      streamReady = true;
      Serial.println("Stream OK.");
      Firebase.RTDB.setInt(&fbWrite, "/servo/angle", currentAngle);
    } else {
      Serial.print("Stream error: ");
      Serial.println(fbStream.errorReason());
      delay(2000);
      return;
    }
  }

  // ── Fast servo poll — 100ms ───────────────────────────────────
  if (now - lastPoll >= POLL_INTERVAL) {
    lastPoll = now;
    if (Firebase.RTDB.getInt(&fbPoll, "/servo/angle")) {
      applyAngle(fbPoll.intData());
    }
  }

  // ── Serial input — only send when user types something ────────
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.length() > 0) {
      Serial.print("[You]: ");
      Serial.println(input);
      sendMessage(input);
    }
  }

  // ── Check if website sent a message ──────────────────────────
  // Web writes to /serial/message with source:"web"
  // ESP32 reads it, prints to Serial, then clears it
  static String lastWebMsg = "";
  if (now % 300 == 0) {   // check every ~300ms
    if (Firebase.RTDB.getJSON(&fbWrite, "/serial/message")) {
      FirebaseJson& json = fbWrite.jsonObject();
      FirebaseJsonData sourceData, textData;
      json.get(sourceData, "source");
      json.get(textData,   "text");

      if (sourceData.success && textData.success) {
        String source = sourceData.stringValue;
        String text   = textData.stringValue;

        // Only print web messages we haven't seen yet
        if (source == "web" && text != lastWebMsg && text.length() > 0) {
          lastWebMsg = text;
          Serial.print("[Web]: ");
          Serial.println(text);
        }
      }
    }
  }

  // ── IR upload ─────────────────────────────────────────────────
  if (now - lastIR >= IR_INTERVAL) {
    lastIR = now;
    int  irRaw    = digitalRead(IR_PIN);
    bool detected = (irRaw == LOW);

    FirebaseJson irJson;
    irJson.set("raw",      irRaw);
    irJson.set("detected", detected);

    Firebase.RTDB.setJSON(&fbWrite, "/ir", &irJson);
  }
}