import express from "express";
import dotenv from "dotenv";
import accountsRouter from "./routes/accounts.js";
import transactionsRouter from "./routes/transactions.js";

dotenv.config();
const app = express();

app.use(express.json());
app.use("/api/accounts", accountsRouter);
app.use("/api/transactions", transactionsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});