import express from "express";
import multer from "multer";
import uploadChunks from "../controllers/uploadChunks.js";
import mergeChunks from "../controllers/mergeChunks.js";

const router = express.Router();
const upload = multer();

router.post("/chunk", upload.single("chunk"), uploadChunks);
router.post("/merge", mergeChunks);

export default router;
