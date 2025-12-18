import fs from "fs-extra";
import path from "path";

export default async function uploadChunks(req, res) {
  const { fileId, chunkIndex } = req.body;

  const chunkDir = path.join("chunks", fileId);
  await fs.ensureDir(chunkDir);

  const chunkPath = path.join(chunkDir, chunkIndex);
  await fs.writeFile(chunkPath, req.file.buffer);

  res.json({ status: "chunk saved" });
}
