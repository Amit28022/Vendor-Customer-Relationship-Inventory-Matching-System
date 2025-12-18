import cron from "node-cron";
import csvQueue from "./csvQueue.js"; 

cron.schedule("*/10 * * * *", async () => {
  await csvQueue.add("processCSV", {
    filePath: "uploads/daily.csv"
  });

  console.log("Cron: Job added");
});
