// const pool = require("../db");
// const csv = require("csv-parser");
// const fs = require("fs");
// const readline = require("readline");
// const zlib = require("zlib");
import pool from "../db.js";
import csv from "csv-parser";
import fs from "fs";
import readline from "readline";
import zlib from "zlib";


// =============================================
// HELPER FUNCTIONS
// =============================================

function normalizeSearchTerm(term) {
  return term
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\r\n]/g, " ");
}

function mapBodyToColumns(body) {
  return {
    Item_Description: body.itemDescription,
    Potential_Buyer_1: body.potentialBuyer1,
    Quantity: body.quantity,
    UQC: body.uqc,
    Unit_Price: body.unitPrice,
    Potential_Buyer_2: body.potentialBuyer2,
    Potential_Buyer_1_Contact_Detail: body.potentialBuyer1ContactDetail,
    Potential_Buyer_1_Email: body.potentialBuyer1Email,
  };
}

// =============================================
// BASIC CRUD OPERATIONS
// =============================================

// 1. CREATE
async function createProduct(req, res) {
  try {
    const data = mapBodyToColumns(req.body);

    if (!data.Item_Description) {
      return res.status(400).json({ message: "Item_Description is required." });
    }

    const [result] = await pool.query(
      `INSERT INTO product_management_data (Item_Description, Potential_Buyer_1, Quantity, UQC, Unit_Price, Potential_Buyer_2, Potential_Buyer_1_Contact_Detail, Potential_Buyer_1_Email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.Item_Description,
        data.Potential_Buyer_1,
        data.Quantity,
        data.UQC,
        data.Unit_Price,
        data.Potential_Buyer_2,
        data.Potential_Buyer_1_Contact_Detail,
        data.Potential_Buyer_1_Email,
      ]
    );

    const insertedId = result.insertId;
    const [rows] = await pool.query(
      "SELECT * FROM product_management_data WHERE Id = ?",
      [insertedId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Error creating product:", err);
    res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
}

// 2. READ ALL
const getAllProducts = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM product_management_data ORDER BY Id"
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("Error fetching all products:", err);
    res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
};

// 3. READ ONE
async function getProductById(req, res) {
  try {
    const { id } = req.params;

    // Validate ID is a number
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const [rows] = await pool.query(
      "SELECT * FROM product_management_data WHERE Id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching product:", err);
    res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
}

// 4. UPDATE
async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const isPatch = req.method === "PATCH";

    // Validate ID
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    if (isPatch) {
      const updates = [];
      const values = [];

      const fieldMap = {
        itemDescription: "Item_Description",
        potentialBuyer1: "Potential_Buyer_1",
        quantity: "Quantity",
        uqc: "UQC",
        unitPrice: "Unit_Price",
        potentialBuyer2: "Potential_Buyer_2",
        potentialBuyer1ContactDetail: "Potential_Buyer_1_Contact_Detail",
        potentialBuyer1Email: "Potential_Buyer_1_Email",
      };

      for (const [key, dbColumn] of Object.entries(fieldMap)) {
        if (req.body[key] !== undefined) {
          updates.push(`${dbColumn} = ?`);
          values.push(req.body[key]);
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      values.push(id);

      const [result] = await pool.query(
        `UPDATE product_management_data SET ${updates.join(", ")} WHERE Id = ?`,
        values
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Product not found" });
      }
    } else {
      const data = mapBodyToColumns(req.body);

      const [result] = await pool.query(
        `UPDATE product_management_data SET Item_Description = ?, Potential_Buyer_1 = ?, Quantity = ?, UQC = ?, Unit_Price = ?, Potential_Buyer_2 = ?, Potential_Buyer_1_Contact_Detail = ?, Potential_Buyer_1_Email = ? WHERE Id = ?`,
        [
          data.Item_Description,
          data.Potential_Buyer_1,
          data.Quantity,
          data.UQC,
          data.Unit_Price,
          data.Potential_Buyer_2,
          data.Potential_Buyer_1_Contact_Detail,
          data.Potential_Buyer_1_Email,
          id,
        ]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Product not found" });
      }
    }

    const [rows] = await pool.query(
      "SELECT * FROM product_management_data WHERE Id = ?",
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("Error updating product:", err);
    res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
}

// 5. DELETE
async function deleteProduct(req, res) {
  try {
    const { id } = req.params;

    // Validate ID
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const [result] = await pool.query(
      "DELETE FROM product_management_data WHERE Id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({ message: "Product deleted successfully", deletedId: id });
  } catch (err) {
    console.error("Error deleting product:", err);
    res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
}

// =============================================
// SEARCH
// =============================================

async function searchByItemDescription(req, res) {
  try {
    const { item_description } = req.query;

    if (!item_description) {
      return res.status(400).json({
        message: "item_description query parameter is required",
      });
    }

    const normalizedSearch = normalizeSearchTerm(item_description);

    const [rows] = await pool.query(
      `SELECT * FROM product_management_data WHERE Item_Description_Search = ?`,
      [normalizedSearch]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message:
          "No data found. Please ensure you are using the full, exact item description.",
        searchedFor: item_description,
        normalizedSearch: normalizedSearch,
      });
    }

    res.json({
      success: true,
      count: rows.length,
      searchTerm: item_description,
      data: rows,
    });
  } catch (err) {
    console.error("Error searching products:", err);
    res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
}

// =============================================
// PAGINATION
// =============================================

const getProductsPaginated = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const maxLimit = 100;

    const safeLimit = Math.min(limit, maxLimit);
    const offset = (page - 1) * safeLimit;

    const [rows] = await pool.query(
      `SELECT * FROM product_management_data ORDER BY Id LIMIT ? OFFSET ?`,
      [safeLimit, offset]
    );

    const [[{ totalRowsInAllPages }]] = await pool.query(
      "SELECT COUNT(*) AS totalRowsInAllPages FROM product_management_data"
    );

    const totalPages = Math.ceil(totalRowsInAllPages / safeLimit);

    res.json({
      success: true,
      data: rows,
      pagination: {
        currentPage: page,
        pageSize: safeLimit,
        totalRows: totalRowsInAllPages,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (err) {
    console.error("Error fetching paginated products:", err);
    res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
};

// Cursor-based pagination
async function getProductsCursor(req, res) {
  try {
    const cursor = parseInt(req.query.cursor) || 0;
    const limit = parseInt(req.query.limit) || 1000;

    const [rows] = await pool.query(
      `SELECT * FROM product_management_data WHERE Id > ? ORDER BY Id LIMIT ?`,
      [cursor, limit]
    );

    const nextCursor = rows.length > 0 ? rows[rows.length - 1].Id : null;

    res.json({
      success: true,
      data: rows,
      nextCursor: nextCursor,
      hasMore: rows.length === limit,
    });
  } catch (err) {
    console.error("Cursor pagination error:", err);
    res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
}

// =============================================
// CSV UPLOAD FUNCTIONS (keeping your existing ones)
// =============================================

// async function uploadCSV(req, res) {
//   if (!req.file) {
//     return res.status(400).json({ message: "CSV file is required" });
//   }

//   const filePath = req.file.path;
//   const rows = [];

//   // Automatically convert headers: space -> underscore
//   const csvOptions = {
//     mapHeaders: ({ header }) => {
//       if (!header) return null;
//       return header
//         .trim()
//         .replace(/\s+/g, "_") // "Potential Buyer 1" → "Potential_Buyer_1"
//         .replace(/[^A-Za-z0-9_]/g, ""); // remove special chars if any
//     },
//     mapValues: ({ value }) =>
//       typeof value === "string" ? value.trim() : value,
//   };

//   fs.createReadStream(filePath)
//     .pipe(csv(csvOptions))
//     .on("data", (row) => {
//       console.log("Mapped row:", row); // check output once
//       rows.push(row);
//     })
//     .on("end", async () => {
//       if (rows.length === 0) {
//         fs.unlink(filePath, () => {});
//         return res.status(400).json({ message: "CSV file is empty" });
//       }

//       const insertQuery = `
//         INSERT INTO product_management_data
//         (
//           Item_Description,
//           Potential_Buyer_1,
//           Quantity,
//           UQC,
//           Unit_Price,
//           Potential_Buyer_2,
//           Potential_Buyer_1_Contact_Detail,
//           Potential_Buyer_1_Email
//         )
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
//       `;

//       const connection = await pool.getConnection();
//       try {
//         await connection.beginTransaction();

//         for (const r of rows) {
//           await connection.query(insertQuery, [
//             r.Item_Description || null,
//             r.Potential_Buyer_1 || null,
//             r.Quantity || null,
//             r.UQC || null,
//             r.Unit_Price || null,
//             r.Potential_Buyer_2 || null,
//             r.Potential_Buyer_1_Contact_Detail ||
//               r.Potential_Buyer_1_Contact_Details ||
//               null,
//             r.Potential_Buyer_1_Email || r.Potential_Buyer_1_email || null,
//           ]);
//         }

//         await connection.commit();
//         res.status(201).json({
//           message: `CSV imported successfully. ${rows.length} rows inserted.`,
//           totalInserted: rows.length,
//         });
//       } catch (err) {
//         await connection.rollback();
//         console.error(err);
//         res.status(500).json({ message: "Import failed", error: err.message });
//       } finally {
//         connection.release();
//         fs.unlink(filePath, () => {});
//       }
//     })
//     .on("error", (err) => {
//       console.error(err);
//       res
//         .status(500)
//         .json({ message: "CSV processing error", error: err.message });
//     });
// }

async function uploadCSV(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: "CSV file is required" });
  }

  const filePath = req.file.path;
  const rows = [];

  // Automatically convert headers: space -> underscore
  const csvOptions = {
    mapHeaders: ({ header }) => {
      if (!header) return null;
      return header
        .trim()
        .replace(/\s+/g, "_") // "Potential Buyer 1" → "Potential_Buyer_1"
        .replace(/[^A-Za-z0-9_]/g, ""); // remove special chars if any
    },
    mapValues: ({ value }) =>
      typeof value === "string" ? value.trim() : value,
  };

  fs.createReadStream(filePath)
    .pipe(csv(csvOptions))
    .on("data", (row) => {
      console.log("Mapped row:", row); // check output once
      rows.push(row);
    })
    .on("end", async () => {
      if (rows.length === 0) {
        fs.unlink(filePath, () => {});
        return res.status(400).json({ message: "CSV file is empty" });
      }

      const insertQuery = `
        INSERT INTO product_management_data
        (
          Item_Description,
          Potential_Buyer_1,
          Quantity,
          UQC,
          Unit_Price,
          Potential_Buyer_2,
          Potential_Buyer_1_Contact_Detail,
          Potential_Buyer_1_Email
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        for (const r of rows) {
          await connection.query(insertQuery, [
            r.Item_Description || null,
            r.Potential_Buyer_1 || null,
            r.Quantity || null,
            r.UQC || null,
            r.Unit_Price || null,
            r.Potential_Buyer_2 || r.Potential_Buyer2 || null,
            r.Potential_Buyer_1_Contact_Detail ||
              r.Potential_Buyer_1_Contact_Details ||
              r.PotentialBuyer1ContactDetails ||
              null,
            r.Potential_Buyer_1_Email ||
              r.Potential_Buyer_1_email ||
              r.Potential_Buyer_1_email_id || // ADD THIS LINE
              null,
          ]);
        }

        await connection.commit();
        res.status(201).json({
          message: `CSV imported successfully. ${rows.length} rows inserted.`,
          totalInserted: rows.length,
        });
      } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ message: "Import failed", error: err.message });
      } finally {
        connection.release();
        fs.unlink(filePath, () => {});
      }
    })
    .on("error", (err) => {
      console.error(err);
      res
        .status(500)
        .json({ message: "CSV processing error", error: err.message });
    });
}

export default {
  // Basic CRUD
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,

  // Search
  searchByItemDescription,

  // Pagination
  getProductsPaginated,
  getProductsCursor,

  // CSV Upload - ONLY the one that exists!
  uploadCSV,

  // REMOVE these lines - functions don't exist:
  // uploadCSVUltraFast,
  // uploadCSVParallel,
  // bulkInsertProducts,
  // exportAllProductsCSV,
  // exportAllProductsJSON,
  // exportCompressed,
};
