import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import productRoutes from "./routes/productRoutes.js";
import matchingRoutes from "./routes/matchingRoutes.js";
import rfqRoutes from "./routes/rfqRoutes.js";
import uploadRoutes from "./routes/upload.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: "http://localhost:5173"
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("Product Management API is running.");
});

app.use("/api/products", productRoutes);
app.use("/api/matching", matchingRoutes);
app.use("/api/rfq", rfqRoutes);
app.use("/upload", uploadRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "Route Not Found",
    path: req.originalUrl,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
