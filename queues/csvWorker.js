import { Worker } from "bullmq";
import redis from "../config/redis.js";
import processCSV from "../utils/processCSV.js";

const worker = new Worker(
  "csvQueue",
  async job => {
    console.log("Processing job:", job.id);
    await processCSV(job.data.filePath);
    return { done: true };
  },
  { connection: redis }
);

worker.on("completed", job => {
  console.log(`Job ${job.id} completed`);
});
