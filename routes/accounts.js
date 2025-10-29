import express from "express";
import { getAccounts } from "../controllers/accountsController.js";
const router = express.Router();

router.get("/", getAccounts);
export default router;
