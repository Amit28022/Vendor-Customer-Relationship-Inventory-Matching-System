// const pool = require("../db");
import pool from "../db.js";

function cleanSearchTerm(term) {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9\s,]/gi, "") // Keep commas for multi-search
    .trim()
    .replace(/\s+/g, " ");
}

function alphanumericOnly(term) {
  return term.toLowerCase().replace(/[^a-z0-9]/gi, "");
}

function generateCustomerId(name, email) {
  // Generate short customer ID: First 3 letters of name + random 3 digits
  const namePart = (name || "CUS").substring(0, 3).toUpperCase();
  const randomPart = Math.floor(100 + Math.random() * 900);
  return `${namePart}${randomPart}`;
}

// async function saveCustomerRequest(req, res) {
//   try {
//     const { customerName, customerEmail, customerNumber, productIds } = req.body;

//     // Validate customer info
//     if (!customerName && !customerEmail && !customerNumber) {
//       return res.status(400).json({
//         success: false,
//         message: "Customer name, email, or number is required",
//       });
//     }

//     if (!productIds) {
//       return res.status(400).json({
//         success: false,
//         message: "productIds is required",
//       });
//     }

//     // Normalize productIds
//     let productIdArray = Array.isArray(productIds)
//       ? productIds.map(Number)
//       : String(productIds).split(",").map(id => Number(id.trim()));

//     productIdArray = productIdArray.filter(Number.isFinite);

//     if (productIdArray.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "At least one valid product ID is required",
//       });
//     }

//     const productIdsString = productIdArray.join(",");
//     const totalQuantity = productIdArray.length;

//     // Insert into DB
//     const insertQuery = `
//       INSERT INTO matching_products
//       (Customer_Name, Customer_Email, Customer_Number, Product_Ids, Total_Quantity)
//       VALUES (?, ?, ?, ?, ?)
//     `;

//     const [insertResult] = await pool.query(insertQuery, [
//       customerName || null,
//       customerEmail || null,
//       customerNumber || null,
//       productIdsString,
//       totalQuantity
//     ]);

//     const matchId = insertResult.insertId;
//     const customerId = `CUS-${matchId}`;

//     await pool.query(
//       `UPDATE matching_products SET Customer_Id = ? WHERE Match_Id = ?`,
//       [customerId, matchId]
//     );

//     // FINAL RESPONSE — NO PRODUCTS SENT
//     return res.status(201).json({
//       success: true,
//       message: "Customer request saved successfully",
//       matchId,
//       customerId,
//       customerDetails: {
//         customerName,
//         customerEmail,
//         customerNumber
//       }
//     });

//   } catch (err) {
//     console.error("Error in saveCustomerRequest:", err);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//       error: err.message
//     });
//   }
// }

// async function saveCustomerRequest(req, res) {
//   try {
//     const {
//       customerName,
//       customerEmail,
//       customerNumber,
//       productIds,
//       product_req,
//       qty,
//     } = req.body;

//     // Validate customer info
//     if (!customerName && !customerEmail && !customerNumber) {
//       return res.status(400).json({
//         success: false,
//         message: "Customer name, email, or number is required",
//       });
//     }

//     if (!productIds) {
//       return res.status(400).json({
//         success: false,
//         message: "productIds is required",
//       });
//     }

//     // Normalize productIds
//     let productIdArray = Array.isArray(productIds)
//       ? productIds.map(Number)
//       : String(productIds)
//           .split(",")
//           .map((id) => Number(id.trim()));

//     productIdArray = productIdArray.filter(Number.isFinite);

//     if (productIdArray.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "At least one valid product ID is required",
//       });
//     }

//     const productIdsString = productIdArray.join(",");
//     const totalQuantity = productIdArray.length;

//     // Insert into DB (updated with product_req)
//     const insertQuery = `
//       INSERT INTO matching_products
//       (Customer_Name, Customer_Email, Customer_Number, Product_Ids, Total_Quantity, Product_Req)
//       VALUES (?, ?, ?, ?, ?, ?)
//     `;

//     const [insertResult] = await pool.query(insertQuery, [
//       customerName || null,
//       customerEmail || null,
//       customerNumber || null,
//       productIdsString,
//       totalQuantity,
//       product_req || null,
//       qty || null,
//     ]);

//     const matchId = insertResult.insertId;
//     const customerId = `CUS-${matchId}`;

//     await pool.query(
//       `UPDATE matching_products SET Customer_Id = ? WHERE Match_Id = ?`,
//       [customerId, matchId]
//     );

//     return res.status(201).json({
//       success: true,
//       message: "Customer request saved successfully",
//       matchId,
//       customerId,
//       customerDetails: {
//         customerName,
//         customerEmail,
//         customerNumber,
//         product_req,
//         qty,
//       },
//     });
//   } catch (err) {
//     console.error("Error in saveCustomerRequest:", err);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//       error: err.message,
//     });
//   }
// }

async function saveCustomerRequest(req, res) {
  try {
    const {
      customerName,
      customerEmail,
      customerNumber,
      productIds,
      product_req,
      qty,
    } = req.body;

    // Validate customer info
    if (!customerName && !customerEmail && !customerNumber) {
      return res.status(400).json({
        success: false,
        message: "Customer name, email, or number is required",
      });
    }

    if (!productIds) {
      return res.status(400).json({
        success: false,
        message: "productIds is required",
      });
    }

    // Normalize product IDs
    let productIdArray = Array.isArray(productIds)
      ? productIds.map(Number)
      : String(productIds)
          .split(",")
          .map((id) => Number(id.trim()));

    productIdArray = productIdArray.filter(Number.isFinite);

    if (productIdArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one valid product ID is required",
      });
    }

    const productIdsString = productIdArray.join(",");
    const totalQuantity = productIdArray.length;

    // 💥 NOW INCLUDING qty IN THE INSERT QUERY
    const insertQuery = `
      INSERT INTO matching_products 
      (Customer_Name, Customer_Email, Customer_Number, Product_Ids, Total_Quantity, Product_Req, Quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [insertResult] = await pool.query(insertQuery, [
      customerName || null,
      customerEmail || null,
      customerNumber || null,
      productIdsString,
      totalQuantity,
      product_req || null,
      qty || null,
    ]);

    const matchId = insertResult.insertId;
    const customerId = `CUS-${matchId}`;

    await pool.query(
      `UPDATE matching_products SET Customer_Id = ? WHERE Match_Id = ?`,
      [customerId, matchId]
    );

    return res.status(201).json({
      success: true,
      message: "Customer request saved successfully",
      matchId,
      customerId,
      customerDetails: {
        customerName,
        customerEmail,
        customerNumber,
        product_req,
        qty,
      },
    });
  } catch (err) {
    console.error("Error in saveCustomerRequest:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
}

async function getCustomerRequestById(req, res) {
  try {
    const { matchId } = req.params;

    const [matchingRecord] = await pool.query(
      "SELECT * FROM matching_products WHERE Match_Id = ?",
      [matchId]
    );

    if (matchingRecord.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No customer request found with Match_Id: ${matchId}`,
      });
    }

    const record = matchingRecord[0];
    const productIds = record.Product_Ids ? record.Product_Ids.split(",") : [];

    if (productIds.length === 0) {
      return res.json({
        success: true,
        customerRequest: record,
        matchedProducts: [],
      });
    }

    // Get all matching products from product_management_data
    const placeholders = productIds.map(() => "?").join(",");
    const [products] = await pool.query(
      `SELECT * FROM product_management_data WHERE Id IN (${placeholders}) ORDER BY Id`,
      productIds
    );

    res.json({
      success: true,
      customerRequest: {
        matchId: record.Match_Id,
        customerId: record.Customer_Id,
        customerName: record.Customer_Name,
        customerEmail: record.Customer_Email,
        customerNumber: record.Customer_Number,
        product_req: record.Product_Req,
        qty: record.Quantity, 
        totalQuantity: record.Total_Quantity,
        createdAt: record.Created_At,
        updatedAt: record.Updated_At,
      },
      matchedProducts: products,
      summary: {
        totalProductsMatched: products.length,
        aggregatedQuantity: record.Total_Quantity,
      },
    });
  } catch (err) {
    console.error("Error in getCustomerRequestById:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
}

// async function getAllCustomerRequests(req, res) {
//   try {
//     const [records] = await pool.query(`
//       SELECT
//         Match_Id,
//         Customer_Id,
//         Customer_Name,
//         Customer_Email,
//         Customer_Number,
//         Product_Ids,
//         Product_Req,
//         Total_Quantity,
//         Created_At,
//         Updated_At
//       FROM matching_products
//       ORDER BY Created_At DESC
//     `);

//     // Build full response with product details
//     const results = await Promise.all(
//       records.map(async (record) => {
//         const productIds = record.Product_Ids
//           ? record.Product_Ids.split(",").map(Number)
//           : [];

//         let products = [];
//         if (productIds.length > 0) {
//           const placeholders = productIds.map(() => "?").join(",");
//           const [rows] = await pool.query(
//             `SELECT * FROM product_management_data
//              WHERE Id IN (${placeholders})
//              ORDER BY Id`,
//             productIds
//           );
//           products = rows;
//         }

//         return {
//           matchId: record.Match_Id,
//           customerId: record.Customer_Id,
//           customerName: record.Customer_Name,
//           customerEmail: record.Customer_Email,
//           customerNumber: record.Customer_Number,
//           totalQuantity: record.Total_Quantity,
//           createdAt: record.Created_At,
//           updatedAt: record.Updated_At,
//           products: products, // FULL PRODUCT DATA
//         };
//       })
//     );

//     res.json({
//       success: true,
//       totalRecords: results.length,
//       data: results,
//     });
//   } catch (err) {
//     console.error("Error in getAllCustomerRequests:", err);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//       error: err.message,
//     });
//   }
// }

async function getAllCustomerRequests(req, res) {
  try {
    const [records] = await pool.query(`
      SELECT 
        Match_Id,
        Customer_Id,
        Customer_Name,
        Customer_Email,
        Customer_Number,
        Product_Ids,
        Product_Req,
        Quantity,
        Total_Quantity,
        Created_At,
        Updated_At
      FROM matching_products
      ORDER BY Created_At DESC
    `);

    // Build full response with product details
    const results = await Promise.all(
      records.map(async (record) => {
        const productIds = record.Product_Ids
          ? record.Product_Ids.split(",").map(Number)
          : [];

        let products = [];
        if (productIds.length > 0) {
          const placeholders = productIds.map(() => "?").join(",");
          const [rows] = await pool.query(
            `SELECT * FROM product_management_data 
             WHERE Id IN (${placeholders})
             ORDER BY Id`,
            productIds
          );
          products = rows;
        }

        // Build final structured record
        return {
          matchId: record.Match_Id,
          customerId: record.Customer_Id,
          customerName: record.Customer_Name,
          customerEmail: record.Customer_Email,
          customerNumber: record.Customer_Number,
          product_req: record.Product_Req, // ✅ Added
          qty: record.Quantity, // ✅ Added
          totalQuantity: record.Total_Quantity,
          createdAt: record.Created_At,
          updatedAt: record.Updated_At,
          products: products, // FULL PRODUCT DATA
        };
      })
    );

    res.json({
      success: true,
      totalRecords: results.length,
      data: results,
    });
  } catch (err) {
    console.error("Error in getAllCustomerRequests:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
}

async function getCustomerRequestWithDetails(req, res) {
  try {
    const { matchId } = req.params;

    const [matchingRecord] = await pool.query(
      "SELECT * FROM matching_products WHERE Match_Id = ?",
      [matchId]
    );

    if (matchingRecord.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No customer request found with Match_Id: ${matchId}`,
      });
    }

    const record = matchingRecord[0];
    const productIds = record.Product_Ids ? record.Product_Ids.split(",") : [];

    if (productIds.length === 0) {
      return res.json({
        success: true,
        data: {
          ...record,
          products: [],
        },
      });
    }

    const placeholders = productIds.map(() => "?").join(",");
    const [products] = await pool.query(
      `SELECT 
        Id,
        Item_Description,
        Potential_Buyer_1,
        Quantity,
        UQC,
        Unit_Price,
        Potential_Buyer_2,
        Potential_Buyer_1_Contact_Detail,
        Potential_Buyer_1_Email
      FROM product_management_data 
      WHERE Id IN (${placeholders}) 
      ORDER BY Id`,
      productIds
    );

    res.json({
      success: true,
      data: {
        matchId: record.Match_Id,
        customerId: record.Customer_Id,
        customerName: record.Customer_Name,
        customerEmail: record.Customer_Email,
        productNeeded: record.Product_Needed,
        totalQuantity: record.Total_Quantity,
        createdAt: record.Created_At,
        updatedAt: record.Updated_At,
        products: products,
      },
    });
  } catch (err) {
    console.error("Error in getCustomerRequestWithDetails:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
}

// =============================================
// API 5: DELETE
// =============================================

async function deleteCustomerRequest(req, res) {
  try {
    const { matchId } = req.params;

    const [result] = await pool.query(
      "DELETE FROM matching_products WHERE Match_Id = ?",
      [matchId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: `No customer request found with Match_Id: ${matchId}`,
      });
    }

    res.json({
      success: true,
      message: "Customer request deleted successfully",
      matchId: parseInt(matchId),
    });
  } catch (err) {
    console.error("Error in deleteCustomerRequest:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
}

// =============================================
// API 6: GET ALL CUSTOMER REQUESTS WITH FULL DETAILS
// =============================================

async function getAllCustomerRequestsWithDetails(req, res) {
  try {
    const { customerId, customerEmail } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 20)
    );
    const offset = (page - 1) * limit;

    let query = "SELECT * FROM matching_products WHERE 1=1";
    const params = [];

    if (customerId) {
      query += " AND Customer_Id = ?";
      params.push(customerId);
    }

    if (customerEmail) {
      query += " AND Customer_Email = ?";
      params.push(customerEmail);
    }

    query += " ORDER BY Created_At DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [records] = await pool.query(query, params);

    // Get total count
    let countQuery =
      "SELECT COUNT(*) as total FROM matching_products WHERE 1=1";
    const countParams = [];

    if (customerId) {
      countQuery += " AND Customer_Id = ?";
      countParams.push(customerId);
    }

    if (customerEmail) {
      countQuery += " AND Customer_Email = ?";
      countParams.push(customerEmail);
    }

    const [[{ total }]] = await pool.query(countQuery, countParams);

    // For each record, get the product details
    const enrichedRecords = await Promise.all(
      records.map(async (record) => {
        const productIds = record.Product_Ids
          ? record.Product_Ids.split(",")
          : [];

        if (productIds.length === 0) {
          return {
            ...record,
            products: [],
          };
        }

        const placeholders = productIds.map(() => "?").join(",");
        const [products] = await pool.query(
          `SELECT 
            Id,
            Item_Description,
            Potential_Buyer_1,
            Quantity,
            UQC,
            Unit_Price,
            Potential_Buyer_2,
            Potential_Buyer_1_Contact_Detail,
            Potential_Buyer_1_Email
          FROM product_management_data 
          WHERE Id IN (${placeholders}) 
          ORDER BY Id`,
          productIds
        );

        return {
          matchId: record.Match_Id,
          customerId: record.Customer_Id,
          customerName: record.Customer_Name,
          customerEmail: record.Customer_Email,
          productNeeded: record.Product_Needed,
          totalQuantity: record.Total_Quantity,
          createdAt: record.Created_At,
          updatedAt: record.Updated_At,
          products: products,
        };
      })
    );

    res.json({
      success: true,
      data: enrichedRecords,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error in getAllCustomerRequestsWithDetails:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
}

async function getCustomerRequestFullByMatchId(req, res) {
  try {
    const { matchId } = req.params;

    // get matching_products row
    const [rows] = await pool.query(
      "SELECT * FROM matching_products WHERE Match_Id = ?",
      [matchId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No data found for Match_Id ${matchId}`,
      });
    }

    const record = rows[0];
    const productIds = record.Product_Ids ? record.Product_Ids.split(",") : [];

    // if no product IDs, return only main record
    if (productIds.length === 0) {
      return res.json({
        success: true,
        matchId,
        customerRequest: record,
        products: [],
      });
    }

    // fetch matching product rows
    const placeholders = productIds.map(() => "?").join(",");
    const [products] = await pool.query(
      `SELECT * FROM product_management_data WHERE Id IN (${placeholders}) ORDER BY Id`,
      productIds
    );

    return res.json({
      success: true,
      matchId,
      customerRequest: record,
      products: products,
    });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
}

  export default {
  saveCustomerRequest,
  getCustomerRequestById,
  getAllCustomerRequests,
  getCustomerRequestWithDetails,
  deleteCustomerRequest,
  getAllCustomerRequestsWithDetails,
  getCustomerRequestFullByMatchId,
};
