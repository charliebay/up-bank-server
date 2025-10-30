import express from "express";
import dotenv from "dotenv";
import accountsRouter from "./routes/accounts.js";
import transactionsRouter from "./routes/transactions.js";
import cron from "node-cron";
import axios from "axios";
import compression from "compression"; // NEW

dotenv.config();
const app = express();

// ----------------------------------------------------
// ⚙️ Middleware setup
// ----------------------------------------------------
app.use(express.json());
app.use(compression()); // gzip large responses
app.use("/api/accounts", accountsRouter);
app.use("/api/transactions", transactionsRouter);

// ----------------------------------------------------
// 🔹 Helper: fetch all transactions with pagination
// ----------------------------------------------------
async function fetchAllTransactions() {
  const all = [];
  let nextUrl = "https://api.up.com.au/api/v1/transactions";
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  while (nextUrl) {
    try {
      const response = await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${process.env.UP_TOKEN}` },
      });

      all.push(...response.data.data);
      nextUrl = response.data.links.next || null;

      console.log(`📦 Fetched ${all.length} so far`);
      if (nextUrl) await delay(1000); // 1 sec between calls
    } catch (err) {
      if (err.response && err.response.status === 429) {
        const wait = 45_000; // 45-second cooldown
        console.warn(`⏳ Rate limit hit, waiting ${wait / 1000}s…`);
        await delay(wait);
        continue;
      } else {
        throw err;
      }
    }
  }

  console.log(`✅ Retrieved ${all.length} total transactions`);
  return all;
}

// ----------------------------------------------------
// 🔹 In-memory cache for faster responses
// ----------------------------------------------------
let cachedCSV = null;
let cachedJSON = null;
let lastFetched = 0; // timestamp (ms)

async function getCachedTransactions() {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;

  if (cachedJSON && (now - lastFetched) < thirtyMinutes) {
    console.log("⚡ Serving cached transactions");
    return { json: cachedJSON, csv: cachedCSV };
  }

  console.log("🔄 Fetching fresh transactions from Up API...");
  const { Parser } = await import("json2csv");
  const transactions = await fetchAllTransactions();

  const flattened = transactions.map((tx) => ({
    id: tx.id,
    createdAt: tx.attributes.createdAt,
    description: tx.attributes.description,
    amount: parseFloat(tx.attributes.amount.value),
    currency: tx.attributes.amount.currencyCode,
    category: tx.relationships.category?.data?.id || "Uncategorized",
  }));

  const parser = new Parser();
  const csv = parser.parse(flattened);

  cachedJSON = flattened;
  cachedCSV = csv;
  lastFetched = now;

  console.log(`💾 Cached ${flattened.length} transactions for 30 minutes`);
  return { json: flattened, csv };
}

// ----------------------------------------------------
// 🔹 Optimized Tableau JSON endpoint (cached + compressed)
// ----------------------------------------------------
app.get("/api/transactions/tableau", async (req, res) => {
  try {
    const { json } = await getCachedTransactions();
    res.json(json);
  } catch (err) {
    console.error("❌ Tableau fetch failed:", err.message);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// ----------------------------------------------------
// 🔹 Optimized CSV export (streaming)
// ----------------------------------------------------
app.get("/api/transactions/csv", async (req, res) => {
  try {
    const { csv } = await getCachedTransactions();

    res.header("Content-Type", "text/csv");
    res.header("Content-Disposition", "attachment; filename=transactions.csv");

    // Stream to client
    res.write(csv);
    res.end();
  } catch (err) {
    console.error("❌ CSV export failed:", err.message);
    res.status(500).json({ error: "Failed to export CSV" });
  }
});

// ----------------------------------------------------
// 🔹 Keep-alive ping (Render free tier)
// ----------------------------------------------------
const RENDER_URL = "https://up-bank-server.onrender.com";

cron.schedule("*/10 * * * *", async () => {
  try {
    await axios.get(`${RENDER_URL}/api/accounts`);
    console.log("🔁 Keep-alive ping sent");
  } catch (err) {
    console.error("⚠️ Keep-alive failed:", err.message);
  }
});

// ----------------------------------------------------
// 🔹 Nightly cache preload (2 AM daily)
// ----------------------------------------------------
cron.schedule("0 2 * * *", async () => {
  try {
    await axios.get(`${RENDER_URL}/api/transactions/csv`);
    console.log("🌙 Preloaded transaction cache for morning Tableau refresh");
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
