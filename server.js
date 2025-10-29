import express from "express";
import dotenv from "dotenv";
import accountsRouter from "./routes/accounts.js";
import transactionsRouter from "./routes/transactions.js";
import cron from "node-cron";
import axios from "axios";

dotenv.config();
const app = express();

app.use(express.json());
app.use("/api/accounts", accountsRouter);
app.use("/api/transactions", transactionsRouter);

// ----------------------------------------------------
// 🔹 Helper: fetch all transactions with pagination
// ----------------------------------------------------
async function fetchAllTransactions() {
  const all = [];
  let nextUrl = "https://api.up.com.au/api/v1/transactions";

  while (nextUrl) {
    const response = await axios.get(nextUrl, {
      headers: { Authorization: `Bearer ${process.env.UP_TOKEN}` },
    });

    all.push(...response.data.data);
    nextUrl = response.data.links.next || null;

    // avoid hammering API
    if (nextUrl) await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`✅ Retrieved ${all.length} total transactions`);
  return all;
}

// ----------------------------------------------------
// 🔹 Tableau JSON endpoint (flat structure)
// ----------------------------------------------------
app.get("/api/transactions/tableau", async (req, res) => {
  try {
    const transactions = await fetchAllTransactions();

    const flattened = transactions.map((tx) => ({
      id: tx.id,
      createdAt: tx.attributes.createdAt,
      description: tx.attributes.description,
      amount: parseFloat(tx.attributes.amount.value),
      currency: tx.attributes.amount.currencyCode,
      category: tx.relationships.category?.data?.id || "Uncategorized",
    }));

    res.json(flattened);
  } catch (err) {
    console.error("❌ Tableau fetch failed:", err.message);
    res.status(500).json({ error: "Failed to fetch all transactions" });
  }
});

// ----------------------------------------------------
// 🔹 CSV export (for Tableau Public Web import)
// ----------------------------------------------------
app.get("/api/transactions/csv", async (req, res) => {
  try {
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

    res.header("Content-Type", "text/csv");
    res.attachment("transactions.csv");
    res.send(csv);
  } catch (err) {
    console.error("❌ CSV export failed:", err.message);
    res.status(500).json({ error: "Failed to export full CSV" });
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
// 🔹 Start the server
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});
