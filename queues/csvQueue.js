import { Queue } from "bullmq";
import redis from "../config/redis.js";

const csvQueue = new Queue("csvQueue", {
  connection: redis
});

export default csvQueue;
