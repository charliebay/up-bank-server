import express from "express";
import dotenv from "dotenv";
import accountsRouter from "./routes/accounts.js";
import transactionsRouter from "./routes/transactions.js";
import cron from "node-cron";
import axios from "axios";
import compression from "compression";
import fs from "fs";
import path from "path";

dotenv.config();
const app = express();

// ----------------------------------------------------
// ⚙️ Middleware setup
// ----------------------------------------------------
app.use(express.json());
app.use(compression());
app.use("/api/accounts", accountsRouter);
app.use("/api/transactions", transactionsRouter);

// ----------------------------------------------------
// 🔹 Load cached transactions from local JSON
// ----------------------------------------------------
const LOCAL_CACHE = path.resolve("./data/transactions_all.json");

function loadCachedTransactions() {
  try {
    const file = fs.readFileSync(LOCAL_CACHE, "utf-8");
    const data = JSON.parse(file);
    console.log(`💾 Loaded ${data.length} cached transactions.`);
    return data;
  } catch (err) {
    console.warn("⚠️ No local cache found or failed to read:", err.message);
    return [];
  }
}

// ----------------------------------------------------
// 🔹 Serve Tableau JSON (cached)
// ----------------------------------------------------
app.get("/api/transactions/tableau", async (req, res) => {
  try {
    const cached = loadCachedTransactions();
    res.json(cached);
  } catch (err) {
    console.error("❌ Tableau fetch failed:", err.message);
    res.status(500).json({ error: "Could not load local data" });
  }
});

// ----------------------------------------------------
// 🔹 Serve CSV (cached)
// ----------------------------------------------------
app.get("/api/transactions/csv", async (req, res) => {
  try {
    const { Parser } = await import("json2csv");
    const cached = loadCachedTransactions();

    const parser = new Parser();
    const csv = parser.parse(cached);

    res.header("Content-Type", "text/csv");
    res.attachment("transactions.csv");
    res.send(csv);
  } catch (err) {
    console.error("❌ CSV export failed:", err.message);
    res.status(500).json({ error: "Could not load CSV" });
  }
});

// ----------------------------------------------------
// 🔹 Keep-alive ping (Render free tier)
// ----------------------------------------------------
const RENDER_URL = "https://up-bank-server.onrender.com";

cron.schedule("*/10 * * * *", async () => {
  try {
    // Ping your own app, not the Up API
    await axios.get(`${RENDER_URL}/api/transactions/tableau`);
    console.log("🔁 Keep-alive ping sent (cached route)");
  } catch (err) {
    console.error("⚠️ Keep-alive failed:", err.message);
  }
});

// ----------------------------------------------------
// 🔹 Nightly preload (optional: keep cache warm for morning Tableau refresh)
// ----------------------------------------------------
cron.schedule("0 2 * * *", async () => {
  try {
    await axios.get(`${RENDER_URL}/api/transactions/csv`);
    console.log("🌙 Preloaded cached CSV for Tableau morning refresh");
  } catch (err) {
    console.error("⚠️ Nightly preload failed:", err.message);
  }
});

// ----------------------------------------------------
// 🔹 Start the server
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});
