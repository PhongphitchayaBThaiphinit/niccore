
const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();

const PORT = Number(process.env.PORT) || 3000;

const dbPath =
  process.env.DATABASE_PATH ||
  path.join(__dirname, "nic_core.db");

const db = new Database(dbPath);

app.use(express.json({ limit: "20kb" }));

app.use(
  express.static(path.join(__dirname, "public"))
);

// DATABASE

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    n REAL NOT NULL,
    p REAL NOT NULL,
    k REAL NOT NULL,
    moisture REAL NOT NULL,
    temperature REAL NOT NULL,
    ph REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const insertReading = db.prepare(`
  INSERT INTO readings (
    n,
    p,
    k,
    moisture,
    temperature,
    ph
  )
  VALUES (
    @N,
    @P,
    @K,
    @M,
    @T,
    @PH
  )
`);

// HEALTH CHECK

app.get("/api/health", (_req, res) => {

  res.json({
    ok: true,
    service: "NIC Core"
  });

});

// RECEIVE DATA

app.post("/api/readings", (req, res) => {

  const data = req.body || {};

  const keys = [
    "N",
    "P",
    "K",
    "M",
    "T",
    "PH"
  ];

  const valid = keys.every(key =>
    typeof data[key] === "number" &&
    Number.isFinite(data[key])
  );

  if (!valid) {

    return res.status(400).json({
      ok: false,
      error: "Expected numeric N, P, K, M, T and PH values."
    });

  }

  try {

    const result = insertReading.run(data);

    res.status(201).json({
      ok: true,
      id: Number(result.lastInsertRowid)
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Database error"
    });

  }

});

// GET HISTORY

app.get("/api/readings", (req, res) => {

  const limit = Math.min(
    Math.max(Number(req.query.limit) || 100, 1),
    500
  );

  const rows = db.prepare(`
    SELECT
      id,
      n,
      p,
      k,
      moisture,
      temperature,
      ph,
      created_at
    FROM readings
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);

  res.json(rows);

});

// DELETE HISTORY

app.delete("/api/readings", (_req, res) => {

  db.prepare("DELETE FROM readings").run();

  res.json({
    ok: true
  });

});

// FRONTEND

app.get(/.*/, (_req, res) => {

  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );

});

// START SERVER

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `NIC Core is running on port ${PORT}`
  );

});
