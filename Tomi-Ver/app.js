// Arduino Web Emulator (no backend)
// - Output: servo angle (0..180)
// - Input: IR sensor analog reading stream (0..1023)

(() => {
  // ---------- DOM ----------
  const simDot = document.getElementById("simDot");
  const simText = document.getElementById("simText");

  const angleSlider = document.getElementById("angleSlider");
  const angleValue = document.getElementById("angleValue");
  const sendAngleBtn = document.getElementById("sendAngleBtn");
  const centerBtn = document.getElementById("centerBtn");
  const randomAngleBtn = document.getElementById("randomAngleBtn");

  const servoArm = document.getElementById("servoArm");
  const servoAngleEl = document.getElementById("servoAngle");

  const irValueEl = document.getElementById("irValue");
  const irDetectedEl = document.getElementById("irDetected");

  const threshold = document.getElementById("threshold");
  const thresholdValue = document.getElementById("thresholdValue");

  const irRate = document.getElementById("irRate");
  const irRateValue = document.getElementById("irRateValue");

  const startIrBtn = document.getElementById("startIrBtn");
  const stopIrBtn = document.getElementById("stopIrBtn");
  const spikeBtn = document.getElementById("spikeBtn");

  const logEl = document.getElementById("log");
  const clearLogBtn = document.getElementById("clearLogBtn");

  const canvas = document.getElementById("chart");
  const ctx = canvas.getContext("2d");

  // ---------- State (simulated Arduino) ----------
  const state = {
    servoAngle: 90,      // degrees
    irValue: 0,          // 0..1023
    irRunning: true,
    irIntervalMs: Number(irRate.value),
    pendingSpike: false, // manual "object" event
    t0: Date.now()
  };

  // chart samples
  const MAX_SAMPLES = 120;
  const samples = []; // {t, v}

  // ---------- Helpers ----------
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function setSimStatus(running) {
    simDot.style.background = running ? "var(--success)" : "var(--danger)";
    simDot.style.boxShadow = running
      ? "0 0 0 3px rgba(64,214,124,0.15)"
      : "0 0 0 3px rgba(255,91,110,0.15)";
    simText.textContent = running ? "Simulation running" : "Simulation paused";
  }

  function log(line) {
    const p = document.createElement("p");
    p.className = "logLine";
    const ts = new Date().toLocaleTimeString();
    p.textContent = `[${ts}] ${line}`;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // Map servo angle to dial rotation:
  // visual dial is like a semicircle -> -90° (left) to +90° (right)
  function updateServoVisual(angleDeg) {
    const a = clamp(angleDeg, 0, 180);
    // map 0..180 -> -90..+90
    const rot = (a - 90);
    servoArm.style.transform = `translateX(-50%) rotate(${rot}deg)`;
    servoAngleEl.textContent = String(a);
  }

  function updateIrUI(value) {
    irValueEl.textContent = String(value);

    const thr = Number(threshold.value);
    const detected = value >= thr;
    irDetectedEl.textContent = detected ? "YES" : "NO";
    irDetectedEl.style.color = detected ? "var(--warn)" : "var(--muted)";
  }

  function pushSample(v) {
    samples.push({ t: Date.now(), v });
    if (samples.length > MAX_SAMPLES) samples.shift();
  }

  function drawChart() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 42, padR = 12, padT = 12, padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // frame
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // y grid + labels (0..1023)
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.font = "12px ui-monospace, monospace";
    for (let i = 0; i <= 4; i++) {
      const yVal = 1023 - i * (1023 / 4);
      const y = padT + (i * plotH) / 4;

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();

      ctx.fillText(String(Math.round(yVal)), 6, y + 4);
    }

    if (samples.length < 2) return;

    // line plot
    ctx.strokeStyle = "rgba(91,124,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < samples.length; i++) {
      const v = samples[i].v;
      const x = padL + (i * plotW) / (MAX_SAMPLES - 1);
      const y = padT + plotH - (v * plotH) / 1023;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // threshold line
    const thr = Number(threshold.value);
    const yThr = padT + plotH - (thr * plotH) / 1023;

    ctx.strokeStyle = "rgba(255,209,102,0.85)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, yThr);
    ctx.lineTo(padL + plotW, yThr);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255,209,102,0.9)";
    ctx.fillText(`thr=${thr}`, padL + plotW - 85, yThr - 6);
  }

  // ---------- IR Simulation ----------
  // Produces a baseline signal + noise + occasional spikes.
  function simulateIrValue() {
    const now = Date.now();

    // baseline drift
    const base = 460 + Math.round(140 * Math.sin((now - state.t0) / 900));

    // noise
    const noise = Math.round((Math.random() - 0.5) * 150);

    // random spike (object near sensor)
    const autoSpike = Math.random() < 0.05 ? Math.round(350 + Math.random() * 250) : 0;

    // manual spike button
    const manualSpike = state.pendingSpike ? Math.round(520 + Math.random() * 250) : 0;
    state.pendingSpike = false;

    let v = base + noise + autoSpike + manualSpike;
    v = clamp(v, 0, 1023);
    return v;
  }

  let irTimer = null;

  function startIr() {
    if (irTimer) return;
    state.irRunning = true;
    setSimStatus(true);

    irTimer = setInterval(() => {
      const v = simulateIrValue();
      state.irValue = v;
      updateIrUI(v);
      pushSample(v);
      drawChart();
    }, state.irIntervalMs);

    log(`IR stream started (${state.irIntervalMs} ms)`);
  }

  function stopIr() {
    state.irRunning = false;
    setSimStatus(false);

    if (irTimer) {
      clearInterval(irTimer);
      irTimer = null;
    }
    log("IR stream stopped");
  }

  function restartIrWithNewRate() {
    if (!state.irRunning) return; // keep stopped if user stopped it
    stopIr();
    startIr();
  }

  // ---------- Servo "output" ----------
  function sendServoAngle(angle) {
    const a = clamp(Math.round(angle), 0, 180);
    state.servoAngle = a;
    updateServoVisual(a);
    log(`Sent servo angle → Arduino (sim): ${a}°`);
  }

  // ---------- UI bindings ----------
  angleSlider.addEventListener("input", () => {
    angleValue.textContent = angleSlider.value;
  });

  sendAngleBtn.addEventListener("click", () => {
    sendServoAngle(Number(angleSlider.value));
  });

  centerBtn.addEventListener("click", () => {
    angleSlider.value = 90;
    angleValue.textContent = "90";
    sendServoAngle(90);
  });

  randomAngleBtn.addEventListener("click", () => {
    const r = Math.floor(Math.random() * 181);
    angleSlider.value = r;
    angleValue.textContent = String(r);
    sendServoAngle(r);
  });

  threshold.addEventListener("input", () => {
    thresholdValue.textContent = threshold.value;
    updateIrUI(state.irValue);
    drawChart();
  });

  irRate.addEventListener("input", () => {
    irRateValue.textContent = irRate.value;
    state.irIntervalMs = Number(irRate.value);
  });

  irRate.addEventListener("change", () => {
    // Apply new rate when user finishes sliding
    log(`IR update rate set to ${state.irIntervalMs} ms`);
    restartIrWithNewRate();
  });

  startIrBtn.addEventListener("click", startIr);
  stopIrBtn.addEventListener("click", stopIr);

  spikeBtn.addEventListener("click", () => {
    state.pendingSpike = true;
    log("Manual IR spike triggered (object near sensor)");
  });

  clearLogBtn.addEventListener("click", () => {
    logEl.innerHTML = "";
    log("Log cleared");
  });

  // ---------- Init ----------
  thresholdValue.textContent = threshold.value;
  irRateValue.textContent = irRate.value;
  angleValue.textContent = angleSlider.value;

  updateServoVisual(state.servoAngle);
  updateIrUI(0);
  drawChart();
  startIr();
})();
