import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true,
  enableLocalInfile: true,
  infileStreamFactory: (filePath) => fs.createReadStream(filePath)
});

export default pool;
