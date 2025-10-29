import express from "express";
import dotenv from "dotenv";
import accountsRouter from "./routes/accounts.js";
import transactionsRouter from "./routes/transactions.js";
import cron from "node-cron";
import axios from "axios";

dotenv.config();
const app = express();

// Base routes
app.use(express.json());
app.use("/api/accounts", accountsRouter);
app.use("/api/transactions", transactionsRouter);

// --------------------------
// 🔹 Tableau-friendly endpoints
// --------------------------
app.get("/api/transactions/tableau", async (req, res) => {
  try {
    const response = await axios.get("https://api.up.com.au/api/v1/transactions", {
      headers: { Authorization: `Bearer ${process.env.UP_TOKEN}` },
    });

    const flattened = response.data.data.map((tx) => ({
      id: tx.id,
      createdAt: tx.attributes.createdAt,
      description: tx.attributes.description,
      amount: parseFloat(tx.attributes.amount.value),
      currency: tx.attributes.amount.currencyCode,
      category: tx.relationships.category?.data?.id || "Uncategorized",
    }));

    res.json(flattened);
  } catch (err) {
    console.error("Tableau fetch failed:", err.message);
    res.status(500).json({ error: "Failed to fetch transactions for Tableau" });
  }
});

// Optional CSV export (for Tableau Web)
app.get("/api/transactions/csv", async (req, res) => {
  try {
    const { Parser } = await import("json2csv");
    const response = await axios.get("https://api.up.com.au/api/v1/transactions", {
      headers: { Authorization: `Bearer ${process.env.UP_TOKEN}` },
    });

    const flattened = response.data.data.map((tx) => ({
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
    console.error("CSV export failed:", err.message);
    res.status(500).json({ error: "Failed to export CSV" });
  }
});

// --------------------------
// 🔹 Keep-alive ping (Render)
// --------------------------
const RENDER_URL = "https://up-bank-server.onrender.com";

cron.schedule("*/10 * * * *", async () => {
  try {
    await axios.get(`${RENDER_URL}/api/accounts`);
    console.log("🔁 Keep-alive ping sent");
  } catch (err) {
    console.error("Keep-alive failed:", err.message);
  }
});

// --------------------------
// 🔹 Start the server
// --------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});

