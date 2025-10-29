import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const BASE_URL = "https://api.up.com.au/api/v1";

export const getAccounts = async (req, res) => {
  try {
    const response = await axios.get(`${BASE_URL}/accounts`, {
      headers: { Authorization: `Bearer ${process.env.UP_TOKEN}` },
    });
    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
};
