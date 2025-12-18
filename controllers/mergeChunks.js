import fs from "fs-extra";
import path from "path";
import csvQueue from "../queues/csvQueue.js";

export default async function mergeChunks(req, res) {
  const { fileId, fileName } = req.body;

  const chunkDir = path.join("chunks", fileId);
  const finalPath = path.join("uploads", fileName);

  const chunks = await fs.readdir(chunkDir);
  chunks.sort((a, b) => Number(a) - Number(b));

  const writeStream = fs.createWriteStream(finalPath);

  for (const chunk of chunks) {
    const chunkPath = path.join(chunkDir, chunk);
    const data = await fs.readFile(chunkPath);
    writeStream.write(data);
  }

  writeStream.end();
  await fs.remove(chunkDir);

  await csvQueue.add("processCSV", { filePath: finalPath });

  res.json({ status: "merged and job queued" });
}
