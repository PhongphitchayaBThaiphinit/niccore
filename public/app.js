
const SERVICE_UUID = "12345678-1234-1234-1234-123456789000";
const CHARACTERISTIC_UUID = "12345678-1234-1234-1234-123456789001";

let bleDevice = null;
let bleCharacteristic = null;
let toastTimer = null;

// เก็บค่าจาก BLE ทั้ง 3 แพ็กเกจ
let latestReading = {
  N: null,
  P: null,
  K: null,
  M: null,
  T: null,
  PH: null
};

const requiredFields = ["N", "P", "K", "M", "T", "PH"];
let receivedFields = new Set();

const $ = id => document.getElementById(id);

const fields = {
  N: "valN",
  P: "valP",
  K: "valK",
  M: "valM",
  T: "valT",
  PH: "valPH"
};

// =====================================
// NOTIFICATION
// =====================================
function notify(message) {
  const el = $("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 3200);
}

// =====================================
// CONNECTION STATUS
// =====================================
function setConnection(connected, name = "") {

  $("statusDot")?.classList.toggle("online", connected);

  if ($("statusText")) {
    $("statusText").textContent =
      connected ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อมต่อ";
  }

  if ($("connectBtn")) {
    $("connectBtn").disabled = connected;
  }

  if ($("disconnectBtn")) {
    $("disconnectBtn").disabled = !connected;
  }

  if ($("deviceName")) {
    $("deviceName").textContent =
      connected ? (name || "ESP32") :
      "ไม่พบอุปกรณ์ที่เชื่อมต่อ";
  }

  if ($("deviceMessage")) {
    $("deviceMessage").textContent =
      connected
        ? "กำลังรับข้อมูลจากอุปกรณ์ผ่าน Bluetooth LE"
        : "กด “เชื่อมต่ออุปกรณ์” แล้วเลือก ESP32";
  }
}

// =====================================
// RESET DATA
// =====================================
function resetBLEReadings() {

  latestReading = {
    N: null,
    P: null,
    K: null,
    M: null,
    T: null,
    PH: null
  };

  receivedFields.clear();
}

// =====================================
// DISCONNECT
// =====================================
function disconnectBLE() {

  if (bleDevice?.gatt?.connected) {
    bleDevice.gatt.disconnect();
  } else {
    onDisconnected();
  }
}

function onDisconnected() {

  bleCharacteristic = null;

  resetBLEReadings();

  setConnection(false);

  notify("ตัดการเชื่อมต่อ Bluetooth แล้ว");
}

// =====================================
// CONNECT BLE
// =====================================
async function connectBLE() {

  if (!navigator.bluetooth) {

    notify("กรุณาใช้ Chrome หรือ Edge");

    $("deviceMessage").textContent =
      "เบราว์เซอร์ไม่รองรับ Web Bluetooth";

    return;
  }

  if (!window.isSecureContext) {

    notify("กรุณาเปิดเว็บผ่าน localhost หรือ HTTPS");

    return;
  }

  try {

    $("connectBtn").disabled = true;

    $("deviceMessage").textContent =
      "กำลังค้นหาอุปกรณ์ Bluetooth...";

    bleDevice = await navigator.bluetooth.requestDevice({

      acceptAllDevices: true,

      optionalServices: [SERVICE_UUID]

    });

    bleDevice.addEventListener(
      "gattserverdisconnected",
      onDisconnected
    );

    $("deviceMessage").textContent =
      `พบ ${bleDevice.name || "ESP32"} กำลังเชื่อมต่อ...`;

    const server = await bleDevice.gatt.connect();

    const service =
      await server.getPrimaryService(SERVICE_UUID);

    bleCharacteristic =
      await service.getCharacteristic(CHARACTERISTIC_UUID);

    // ลงทะเบียนรับข้อมูลก่อนเริ่ม Notify
    bleCharacteristic.addEventListener(
      "characteristicvaluechanged",
      onBLEData
    );

    await bleCharacteristic.startNotifications();

    setConnection(true, bleDevice.name);

    notify("เชื่อมต่อ ESP32 สำเร็จ");

  } catch (error) {

    console.error("BLE Error:", error);

    $("connectBtn").disabled = false;

    $("deviceMessage").textContent =
      `${error.name}: ${error.message}`;

    if (error.name !== "NotFoundError") {
      notify("เชื่อมต่อไม่สำเร็จ: " + error.message);
    }
  }
}

// =====================================
// PARSE BLE DATA
// =====================================
function parseBLEPayload(text) {

  const data = {};

  // รองรับ JSON
  if (text.startsWith("{")) {

    const json = JSON.parse(text);

    Object.entries(json).forEach(([key, value]) => {

      const normalizedKey = key.trim().toUpperCase();

      if (requiredFields.includes(normalizedKey)) {

        const numberValue = Number(value);

        if (Number.isFinite(numberValue)) {
          data[normalizedKey] = numberValue;
        }
      }
    });

    return data;
  }

  // รองรับข้อมูลแบบเดิม
  // N:120,P:45,K:80
  // M:35.5,T:28.6
  // PH:6.5

  text.split(",").forEach(part => {

    const index = part.indexOf(":");

    if (index === -1) return;

    const key = part.substring(0, index)
      .trim()
      .toUpperCase();

    const rawValue = part.substring(index + 1).trim();

    const value = Number(rawValue);

    if (
      requiredFields.includes(key) &&
      rawValue !== "" &&
      Number.isFinite(value)
    ) {

      data[key] = value;

    }
  });

  return data;
}

// =====================================
// RECEIVE BLE DATA
// =====================================
function onBLEData(event) {

  const text = new TextDecoder()
    .decode(event.target.value)
    .trim();

  console.log("BLE Received:", text);

  try {

    const data = parseBLEPayload(text);

    const keys = Object.keys(data);

    if (keys.length === 0) {
      throw new Error("ไม่พบข้อมูลตัวเลข");
    }

    // เก็บเฉพาะค่าที่ได้รับ
    keys.forEach(key => {

      latestReading[key] = data[key];

      receivedFields.add(key);

    });

    console.log("Current Data:", latestReading);

    console.log(
      "Received:",
      [...receivedFields]
    );

    // ตรวจสอบว่าครบ 6 ค่าแล้วหรือยัง
    const complete = requiredFields.every(
      key => receivedFields.has(key)
    );

    if (!complete) {

      $("deviceMessage").textContent =
        `กำลังรับข้อมูล ${receivedFields.size}/6 รายการ`;

      return;
    }

    // ข้อมูลครบแล้ว
    const normalized = { ...latestReading };

    console.log("Complete Soil Data:", normalized);

    // แสดงบนเว็บไซต์
    renderReading(normalized);

    // บันทึกลงฐานข้อมูล
    saveReading(normalized);

    $("deviceMessage").textContent =
      "รับข้อมูลครบทั้ง 6 รายการแล้ว";

  } catch (error) {

    console.error(
      "BLE Parsing Error:",
      text,
      error
    );

    $("deviceMessage").textContent =
      "ได้รับข้อมูลแต่แปลผลไม่ได้: " + error.message;
  }
}

// =====================================
// DISPLAY DATA
// =====================================
function renderReading(data) {

  Object.entries(fields).forEach(([key, id]) => {

    const element = $(id);

    if (element) {
      element.textContent = data[key];
    }

  });

  if ($("lastUpdated")) {

    $("lastUpdated").textContent =
      new Date().toLocaleTimeString("th-TH");

  }

  if ($("chartEmpty")) {
    $("chartEmpty").style.display = "none";
  }
}

// =====================================
// SAVE DATABASE
// =====================================
async function saveReading(data) {

  try {

    const response = await fetch("/api/readings", {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(data)

    });

    if (!response.ok) {

      let message = "Save failed";

      try {
        const result = await response.json();
        message = result.error || message;
      } catch (_) {}

      throw new Error(message);
    }

    await loadHistory();

  } catch (error) {

    console.error("Save Error:", error);

    $("deviceMessage").textContent =
      "รับค่าแล้ว แต่บันทึกฐานข้อมูลไม่สำเร็จ: " +
      error.message;
  }
}

// =====================================
// LOAD HISTORY
// =====================================
async function loadHistory() {

  try {

    const response = await fetch(
      "/api/readings?limit=100"
    );

    if (!response.ok) {
      throw new Error("โหลดประวัติไม่สำเร็จ");
    }

    const rows = await response.json();

    const body = $("historyBody");

    if (body) {

      body.replaceChildren();

      if (!rows.length) {

        const tr = document.createElement("tr");

        const td = document.createElement("td");

        td.colSpan = 7;

        td.className = "empty-cell";

        td.textContent = "ยังไม่มีข้อมูล";

        tr.appendChild(td);

        body.appendChild(tr);

      } else {

        rows.forEach(row => {

          const tr = document.createElement("tr");

          const date = new Date(
            row.created_at.replace(" ", "T") + "Z"
          );

          const values = [
            date.toLocaleString("th-TH"),
            row.n,
            row.p,
            row.k,
            row.moisture,
            row.temperature,
            row.ph
          ];

          values.forEach(value => {

            const td = document.createElement("td");

            td.textContent = value ?? "-";

            tr.appendChild(td);

          });

          body.appendChild(tr);

        });
      }
    }

    drawChart(rows.slice().reverse());

  } catch (error) {

    console.error("History Error:", error);

    notify("ไม่สามารถโหลดประวัติได้ กรุณาตรวจสอบ Server");
  }
}

// =====================================
// MOISTURE CHART
// =====================================
function drawChart(rows) {

  const canvas = $("moistureChart");

  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  const width = canvas.clientWidth;

  const height = 135;

  const ratio = window.devicePixelRatio || 1;

  if (!width) return;

  canvas.width = width * ratio;

  canvas.height = height * ratio;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  ctx.clearRect(0, 0, width, height);

  const values = rows
    .slice(-20)
    .map(row => Number(row.moisture))
    .filter(Number.isFinite);

  if (!values.length) {

    if ($("chartEmpty")) {
      $("chartEmpty").style.display = "block";
    }

    return;
  }

  if ($("chartEmpty")) {
    $("chartEmpty").style.display = "none";
  }

  const min = Math.min(0, ...values);

  const max = Math.max(100, ...values);

  const pad = 12;

  const x = i =>
    pad + (
      values.length === 1
        ? 0
        : i * (width - pad * 2) / (values.length - 1)
    );

  const y = v =>
    height - pad -
    ((v - min) / (max - min || 1)) *
    (height - pad * 2);

  ctx.strokeStyle = "#e7eee9";

  ctx.lineWidth = 1;

  [0.25, 0.5, 0.75].forEach(f => {

    ctx.beginPath();

    ctx.moveTo(0, height * f);

    ctx.lineTo(width, height * f);

    ctx.stroke();

  });

  const gradient = ctx.createLinearGradient(
    0, 0, 0, height
  );

  gradient.addColorStop(
    0,
    "rgba(35,134,87,.22)"
  );

  gradient.addColorStop(
    1,
    "rgba(35,134,87,0)"
  );

  ctx.beginPath();

  values.forEach((v, i) => {

    if (i) {
      ctx.lineTo(x(i), y(v));
    } else {
      ctx.moveTo(x(i), y(v));
    }

  });

  ctx.lineTo(x(values.length - 1), height);

  ctx.lineTo(x(0), height);

  ctx.closePath();

  ctx.fillStyle = gradient;

  ctx.fill();

  ctx.beginPath();

  values.forEach((v, i) => {

    if (i) {
      ctx.lineTo(x(i), y(v));
    } else {
      ctx.moveTo(x(i), y(v));
    }

  });

  ctx.strokeStyle = "#238657";

  ctx.lineWidth = 2.5;

  ctx.lineJoin = "round";

  ctx.stroke();

  values.forEach((v, i) => {

    ctx.beginPath();

    ctx.arc(x(i), y(v), 3, 0, Math.PI * 2);

    ctx.fillStyle = "#176b45";

    ctx.fill();

  });
}

// =====================================
// CLEAR HISTORY
// =====================================
async function clearHistory() {

  if (!confirm("ต้องการลบประวัติทั้งหมดหรือไม่?")) {
    return;
  }

  try {

    const response = await fetch(
      "/api/readings",
      { method: "DELETE" }
    );

    if (!response.ok) {
      throw new Error("ลบประวัติไม่สำเร็จ");
    }

    await loadHistory();

    notify("ลบประวัติเรียบร้อย");

  } catch (error) {

    notify(error.message);

  }
}

// =====================================
// INITIALIZE
// =====================================
window.addEventListener("DOMContentLoaded", () => {

  $("connectBtn")?.addEventListener(
    "click",
    connectBLE
  );

  $("disconnectBtn")?.addEventListener(
    "click",
    disconnectBLE
  );

  $("refreshBtn")?.addEventListener(
    "click",
    loadHistory
  );

  $("clearBtn")?.addEventListener(
    "click",
    clearHistory
  );

  window.addEventListener("resize", () => {
    loadHistory();
  });

  setConnection(false);

  loadHistory();

});
