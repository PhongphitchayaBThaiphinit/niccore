// NIC Core browser client. BLE requires Chrome/Edge and a secure context (localhost or HTTPS).
const SERVICE_UUID = "12345678-1234-1234-1234-123456789000";
const CHARACTERISTIC_UUID = "12345678-1234-1234-1234-123456789001";
let bleDevice = null;
let bleCharacteristic = null;
let toastTimer = null;

const $ = id => document.getElementById(id);
const fields = { N: "valN", P: "valP", K: "valK", M: "valM", T: "valT", PH: "valPH" };

function notify(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
function setConnection(connected, name = "") {
  $("statusDot").classList.toggle("online", connected);
  $("statusText").textContent = connected ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อมต่อ";
  $("connectBtn").disabled = connected;
  $("disconnectBtn").disabled = !connected;
  $("deviceName").textContent = connected ? (name || "ESP32") : "ไม่พบอุปกรณ์ที่เชื่อมต่อ";
  $("deviceMessage").textContent = connected
    ? "กำลังรับข้อมูลจากอุปกรณ์ผ่าน Bluetooth LE"
    : "กด “เชื่อมต่ออุปกรณ์” แล้วเลือก ESP32 จากหน้าต่าง Bluetooth";
}
function disconnectBLE() {
  if (bleDevice?.gatt?.connected) bleDevice.gatt.disconnect();
  else onDisconnected();
}
function onDisconnected() {
  bleCharacteristic = null;
  setConnection(false);
  notify("ตัดการเชื่อมต่อ Bluetooth แล้ว");
}

async function connectBLE() {
  if (!navigator.bluetooth) {
    notify("เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth กรุณาใช้ Chrome หรือ Edge");
    $("deviceMessage").textContent = "Web Bluetooth ไม่พร้อมใช้งานในเบราว์เซอร์นี้";
    return;
  }
  if (!window.isSecureContext) {
    notify("กรุณาเปิดเว็บผ่าน localhost หรือ HTTPS");
    return;
  }
  try {
    $("connectBtn").disabled = true;
    $("deviceMessage").textContent = "กำลังค้นหาอุปกรณ์ Bluetooth...";
    // ต้องเรียก requestDevice จากการคลิกของผู้ใช้โดยตรง เพื่อให้หน้าต่างเลือกอุปกรณ์เปิดได้
    bleDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID]
    });
    bleDevice.addEventListener("gattserverdisconnected", onDisconnected);

    $("deviceMessage").textContent = `พบ ${bleDevice.name || "อุปกรณ์"} กำลังเชื่อมต่อ...`;
    const server = await bleDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    bleCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
    await bleCharacteristic.startNotifications();
    bleCharacteristic.addEventListener("characteristicvaluechanged", onBLEData);

    setConnection(true, bleDevice.name);
    notify("เชื่อมต่อ ESP32 สำเร็จ");
  } catch (error) {
    console.error("BLE connection error:", error);
    $("connectBtn").disabled = false;
    $("deviceMessage").textContent = `${error.name}: ${error.message}`;
    if (error.name !== "NotFoundError") notify(`เชื่อมต่อไม่สำเร็จ: ${error.message}`);
  }
}

function onBLEData(event) {
  const text = new TextDecoder().decode(event.target.value).trim();
  try {
    // รองรับ JSON: {"N":40,"P":20,"K":30,"M":60,"T":28,"PH":6.5}
    // และข้อความแบบเดิม: N:40,P:20,K:30,M:60,T:28,PH:6.5
    let data;
    if (text.startsWith("{")) data = JSON.parse(text);
    else {
      data = {};
      text.split(",").forEach(part => {
        const [key, value] = part.split(":");
        if (key && value !== undefined) data[key.trim().toUpperCase()] = Number(value);
      });
      if (data.PH === undefined && data.PH !== 0) data.PH = data.PH;
    }
    const normalized = {
      N: Number(data.N), P: Number(data.P), K: Number(data.K),
      M: Number(data.M), T: Number(data.T), PH: Number(data.PH)
    };
    if (!Object.values(normalized).every(Number.isFinite)) {
      throw new Error("รูปแบบข้อมูลไม่ถูกต้อง ต้องมี N, P, K, M, T และ PH เป็นตัวเลข");
    }
    renderReading(normalized);
    saveReading(normalized);
  } catch (error) {
    console.error("Invalid BLE payload:", text, error);
    $("deviceMessage").textContent = `ได้รับข้อมูลแต่แปลผลไม่ได้: ${error.message}`;
  }
}

function renderReading(data) {
  Object.entries(fields).forEach(([key, id]) => $(id).textContent = data[key]);
  $("lastUpdated").textContent = new Date().toLocaleTimeString("th-TH");
  $("chartEmpty").style.display = "none";
}

async function saveReading(data) {
  try {
    const response = await fetch("/api/readings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error((await response.json()).error || "Save failed");
    await loadHistory();
  } catch (error) {
    console.error("Save error:", error);
    $("deviceMessage").textContent = `รับค่าแล้ว แต่บันทึกฐานข้อมูลไม่สำเร็จ: ${error.message}`;
  }
}

async function loadHistory() {
  try {
    const response = await fetch("/api/readings?limit=100");
    if (!response.ok) throw new Error("โหลดประวัติไม่สำเร็จ");
    const rows = await response.json();
    const body = $("historyBody");
    body.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7; td.className = "empty-cell"; td.textContent = "ยังไม่มีข้อมูล";
      tr.appendChild(td); body.appendChild(tr);
    } else {
      rows.forEach(row => {
        const tr = document.createElement("tr");
        const date = new Date(row.created_at.replace(" ", "T") + "Z");
        const values = [date.toLocaleString("th-TH"), row.n, row.p, row.k, row.moisture, row.temperature, row.ph];
        values.forEach(value => {
          const td = document.createElement("td");
          td.textContent = value;
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
    }
    drawChart(rows.slice().reverse());
  } catch (error) {
    console.error(error);
    notify("ไม่สามารถโหลดประวัติได้ กรุณาตรวจสอบ Server");
  }
}

function drawChart(rows) {
  const canvas = $("moistureChart");
  const ctx = canvas.getContext("2d");
  const width = canvas.clientWidth;
  const height = 135;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);
  const values = rows.slice(-20).map(row => Number(row.moisture));
  if (!values.length) { $("chartEmpty").style.display = "block"; return; }
  $("chartEmpty").style.display = "none";
  const min = Math.min(0, ...values);
  const max = Math.max(100, ...values);
  const pad = 12;
  const x = i => pad + (values.length === 1 ? 0 : i * (width - pad * 2) / (values.length - 1));
  const y = v => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  ctx.strokeStyle = "#e7eee9"; ctx.lineWidth = 1;
  [0.25, 0.5, 0.75].forEach(f => { ctx.beginPath(); ctx.moveTo(0, height*f); ctx.lineTo(width, height*f); ctx.stroke(); });
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(35,134,87,.22)");
  gradient.addColorStop(1, "rgba(35,134,87,0)");
  ctx.beginPath();
  values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
  ctx.lineTo(x(values.length - 1), height); ctx.lineTo(x(0), height); ctx.closePath();
  ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath();
  values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
  ctx.strokeStyle = "#238657"; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
  values.forEach((v, i) => { ctx.beginPath(); ctx.arc(x(i), y(v), 3, 0, Math.PI*2); ctx.fillStyle = "#176b45"; ctx.fill(); });
}

async function clearHistory() {
  if (!confirm("ต้องการลบประวัติทั้งหมดหรือไม่?")) return;
  try {
    const response = await fetch("/api/readings", { method: "DELETE" });
    if (!response.ok) throw new Error("ลบประวัติไม่สำเร็จ");
    await loadHistory();
    notify("ลบประวัติเรียบร้อย");
  } catch (error) { notify(error.message); }
}

$("connectBtn").addEventListener("click", connectBLE);
$("disconnectBtn").addEventListener("click", disconnectBLE);
$("refreshBtn").addEventListener("click", loadHistory);
$("clearBtn").addEventListener("click", clearHistory);
window.addEventListener("resize", () => loadHistory());
window.addEventListener("DOMContentLoaded", () => { setConnection(false); loadHistory(); });
