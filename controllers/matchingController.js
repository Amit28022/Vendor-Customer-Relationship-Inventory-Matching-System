// const pool = require("../db");
import pool from "../db.js";

function cleanSearchTerm(term) {
  return term
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toBooleanMode(term) {
  return term
    .split(" ")
    .filter(Boolean)
    .map((t) => `+${t}`)
    .join(" ");
}

function calculateMatchAccuracy(searchTerm, description) {
  const s = searchTerm.toLowerCase();
  const d = description.toLowerCase();

  if (d === s) return 100;
  if (d.startsWith(s)) return 90;
  if (d.includes(s)) return 75;

  const sWords = s.split(" ");
  const dWords = d.split(" ");

  const matched = sWords.filter((w) => dWords.includes(w)).length;
  return Math.round((matched / sWords.length) * 60);
}

function alphanumericOnly(term) {
  return term.toLowerCase().replace(/[^a-z0-9]/gi, "");
}

// function calculateMatchAccuracy(searchTerm, foundItem) {
//   const search = alphanumericOnly(searchTerm).toLowerCase();
//   const found = alphanumericOnly(foundItem).toLowerCase();

//   // Exact match
//   if (search === found) return "100%";

//   // Calculate similarity percentage using Levenshtein-like logic
//   if (found.includes(search)) {
//     // Search term is fully contained in found item
//     const ratio = (search.length / found.length) * 100;
//     return Math.round(ratio) + "%";
//   }

//   if (search.includes(found)) {
//     // Found item is fully contained in search term
//     const ratio = (found.length / search.length) * 100;
//     return Math.round(ratio) + "%";
//   }

//   // Calculate character-by-character similarity
//   let matches = 0;
//   const shorter = search.length < found.length ? search : found;
//   const longer = search.length >= found.length ? search : found;

//   for (let i = 0; i < shorter.length; i++) {
//     if (longer.includes(shorter[i])) {
//       matches++;
//     }
//   }

//   const ratio = (matches / longer.length) * 100;
//   return Math.max(Math.round(ratio), 30) + "%"; // Minimum 30% for any match
// }

async function getNextMatchId() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Get and increment match number
    const [rows] = await connection.query(
      "SELECT Match_Number FROM Match_Counter WHERE Id = 1 FOR UPDATE"
    );

    let matchNumber = 1;
    if (rows.length > 0) {
      matchNumber = rows[0].Match_Number + 1;
      await connection.query(
        "UPDATE Match_Counter SET Match_Number = ? WHERE Id = 1",
        [matchNumber]
      );
    } else {
      await connection.query(
        "INSERT INTO Match_Counter (Match_Number) VALUES (?)",
        [1]
      );
    }

    await connection.commit();

    // Format as 001, 002, etc.
    return String(matchNumber).padStart(3, "0");
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function searchAndSaveMatches(req, res) {
  try {
    const { itemDescription, customerName, customerEmail, customerWhatsapp } =
      req.body;

    // Validation - only itemDescription is required
    if (!itemDescription) {
      return res.status(400).json({
        success: false,
        message: "itemDescription is required",
      });
    }

    // Customer email is now optional - no validation needed

    // Split by comma for multiple searches
    const searchTerms = itemDescription
      .split(",")
      .map((term) => term.trim())
      .filter((term) => term.length > 0);

    if (searchTerms.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one search term is required",
      });
    }

    const MIN_FUZZY_LENGTH = 3;
    const allMatchedProducts = [];
    const searchResults = [];

    // Search for each term separately
    for (const searchTerm of searchTerms) {
      const cleanedWithSpaces = cleanSearchTerm(searchTerm);
      const cleanedNoSpaces = alphanumericOnly(searchTerm);

      if (cleanedNoSpaces.length === 0) {
        searchResults.push({
          searchTerm: searchTerm,
          found: false,
          count: 0,
          reason: "Search term must contain letters or numbers",
        });
        continue;
      }

      // Build the search query (same as searchController)
      let query = `SELECT DISTINCT * FROM product_management_data
WHERE 
  Item_Description_Search = ?
  OR Item_Description_Search LIKE ?
  OR Item_Description_Search LIKE ?
  OR Item_Description_Search LIKE ?`;

      const params = [
        cleanedWithSpaces,
        `${cleanedWithSpaces} %`,
        `% ${cleanedWithSpaces}`,
        `% ${cleanedWithSpaces} %`,
      ];

      if (cleanedNoSpaces.length >= MIN_FUZZY_LENGTH) {
        query += `
  OR Item_Description_Alphanumeric = ?
  OR Item_Description_Alphanumeric LIKE ?
  OR Item_Description_Alphanumeric LIKE ?`;

        params.push(
          cleanedNoSpaces,
          `${cleanedNoSpaces}%`,
          `%${cleanedNoSpaces}%`
        );
      }

      query += `
ORDER BY Id ASC`;

      const [matchedProducts] = await pool.query(query, params);

      // Add search term to each product for tracking
      matchedProducts.forEach((product) => {
        product._searchTerm = searchTerm;
        product._matchAccuracy = calculateMatchAccuracy(
          searchTerm,
          product.Item_Description
        );
      });

      searchResults.push({
        searchTerm: searchTerm,
        found: matchedProducts.length > 0,
        count: matchedProducts.length,
      });

      allMatchedProducts.push(...matchedProducts);
    }

    // Remove duplicates (same product found by multiple search terms)
    const uniqueProducts = [];
    const seenIds = new Set();

    for (const product of allMatchedProducts) {
      if (!seenIds.has(product.Id)) {
        seenIds.add(product.Id);
        uniqueProducts.push(product);
      }
    }

    const matchedProducts = uniqueProducts;

    if (matchedProducts.length === 0) {
      // Create detailed no data message for multiple searches
      const notFoundTerms = searchResults
        .filter((r) => !r.found)
        .map((r) => r.searchTerm);
      const notFoundList = notFoundTerms
        .map((term, i) => `${i + 1}. ${term}`)
        .join("\n");

      return res.status(404).json({
        success: false,
        message: "No matching products found#####",
        searchedFor: itemDescription,
        searchTerms: searchTerms,
        searchResults: searchResults,
        searchedAs: {
          withSpaces: searchTerms.map((t) => cleanSearchTerm(t)),
          noSpaces: searchTerms.map((t) => alphanumericOnly(t)),
        },
        whatsappMessage: `❌ *No Products Found*\n\n🔍 *Searched for ${
          searchTerms.length
        } ${
          searchTerms.length === 1 ? "item" : "items"
        }:*\n${notFoundList}\n\n⚠️ No matching products available in our database.\n\n💡 *Suggestions:*\n• Try using different keywords\n• Check the spelling\n• Use shorter search terms\n• Remove special characters\n• Contact support for assistance\n\n📞 Need help? Contact us!`,
      });
    }

    // Step 2: Get new Match_Id
    const matchId = await getNextMatchId();

    // Step 3: Save all matches to Matching_Products table
    const connection = await pool.getConnection();
    const savedProducts = [];

    try {
      await connection.beginTransaction();

      for (let i = 0; i < matchedProducts.length; i++) {
        const product = matchedProducts[i];
        const productId = `${matchId}-${String(i + 1).padStart(2, "0")}`;
        const matchAccuracy =
          product._matchAccuracy ||
          calculateMatchAccuracy(itemDescription, product.Item_Description);
        const searchedTerm = product._searchTerm || itemDescription;

        const insertQuery = `
          INSERT INTO Matching_Products (
            Match_Id, Product_Id, Customer_Name, Customer_Email, 
            Customer_Whatsapp_Number, Product_Needed, Vendor_Item_Found,
            Vendor_Available_Quantity, Vendor_Price, Match_Accuracy,
            Potential_Buyer_1, Potential_Buyer_2, 
            Potential_Buyer_1_Contact_Detail, Potential_Buyer_1_Email
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.query(insertQuery, [
          matchId,
          productId,
          customerName || null,
          customerEmail || null,
          customerWhatsapp || null,
          searchedTerm, // The specific search term that found this product
          product.Item_Description, // What we found in the database
          product.Quantity,
          product.Unit_Price,
          matchAccuracy,
          product.Potential_Buyer_1,
          product.Potential_Buyer_2,
          product.Potential_Buyer_1_Contact_Detail,
          product.Potential_Buyer_1_Email,
        ]);

        savedProducts.push({
          productId,
          searchedFor: searchedTerm,
          itemDescription: product.Item_Description,
          quantity: product.Quantity,
          uqc: product.UQC,
          price: product.Unit_Price,
          matchAccuracy,
          potentialBuyer1: product.Potential_Buyer_1,
          potentialBuyer2: product.Potential_Buyer_2,
        });
      }

      await connection.commit();

      // Group products by search term for better WhatsApp formatting
      const groupedBySearch = {};
      savedProducts.forEach((p) => {
        if (!groupedBySearch[p.searchedFor]) {
          groupedBySearch[p.searchedFor] = [];
        }
        groupedBySearch[p.searchedFor].push(p);
      });

      // Build WhatsApp message with grouped results
      let whatsappProductList = "";
      let productCounter = 1;

      if (searchTerms.length > 1) {
        // Multiple search terms - group by search
        for (const searchTerm of searchTerms) {
          const products = groupedBySearch[searchTerm] || [];
          if (products.length > 0) {
            whatsappProductList += `\n🔍 *"${searchTerm}"* (${
              products.length
            } ${products.length === 1 ? "match" : "matches"})\n`;
            products.forEach((p) => {
              whatsappProductList += `\n${productCounter}. ${
                p.itemDescription
              }\n   💰 Price: ₹${p.price}\n   📊 Qty: ${p.quantity}${
                p.uqc ? " " + p.uqc : ""
              }\n   ✨ Match: ${p.matchAccuracy}`;
              productCounter++;
            });
            whatsappProductList += "\n";
          }
        }
      } else {
        // Single search term - simple list
        savedProducts.forEach((p) => {
          whatsappProductList += `\n${productCounter}. ${
            p.itemDescription
          }\n   💰 Price: ₹${p.price}\n   📊 Qty: ${p.quantity}${
            p.uqc ? " " + p.uqc : ""
          }\n   ✨ Match: ${p.matchAccuracy}`;
          if (productCounter < savedProducts.length) {
            whatsappProductList += "\n";
          }
          productCounter++;
        });
      }

      // Build search summary
      const foundSearches = searchResults.filter((r) => r.found);
      const notFoundSearches = searchResults.filter((r) => !r.found);

      let searchSummary = "";
      if (searchTerms.length > 1) {
        searchSummary = `\n\n📊 *Search Summary:*\n✅ Found: ${foundSearches.length}/${searchTerms.length} searches\n📦 Total Products: ${matchedProducts.length}`;
        if (notFoundSearches.length > 0) {
          searchSummary += `\n❌ Not Found: ${notFoundSearches
            .map((s) => s.searchTerm)
            .join(", ")}`;
        }
      }

      res.status(201).json({
        success: true,
        message: "Products matched and saved successfully",
        matchId: matchId,
        totalMatches: matchedProducts.length,
        searchedFor: itemDescription,
        searchTerms: searchTerms,
        searchResults: searchResults,
        customerInfo: {
          name: customerName || null,
          email: customerEmail || null,
          whatsapp: customerWhatsapp || null,
        },
        savedProducts: savedProducts,
        whatsappMessage: `✅ *Products Found!*\n\n🔍 Search: *${
          searchTerms.length === 1
            ? searchTerms[0]
            : searchTerms.length + " items"
        }*\n📦 Total Matches: *${
          matchedProducts.length
        }*\n🆔 Match ID: *${matchId}*\n\n*Matched Products:*${whatsappProductList}${searchSummary}\n\n✅ All products have been saved successfully!${
          customerName ? `\n\n👤 Customer: ${customerName}` : ""
        }`,
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("Error in searchAndSaveMatches:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
}

// const {
//   cleanSearchTerm,
//   toBooleanMode,
//   calculateMatchAccuracy,
// } = require("./searchUtils");
// async function searchMatches(req, res) {
//   try {
//     const { itemDescription, page = 1, limit = 50 } = req.query;

//     if (!itemDescription) {
//       return res.status(400).json({
//         success: false,
//         message: "itemDescription query parameter is required",
//       });
//     }

//     const offset = (Number(page) - 1) * Number(limit);

//     const searchTerms = itemDescription
//       .split(",")
//       .map(t => t.trim())
//       .filter(Boolean);

//     if (!searchTerms.length) {
//       return res.status(400).json({
//         success: false,
//         message: "Valid search term required",
//       });
//     }

//     const combinedSearch = searchTerms.join(" ");

//     const query = `
//   SELECT
//     id,
//     Item_Description,
//     Quantity,
//     UQC,
//     Unit_Price,
//     Potential_Buyer_1,
//     Potential_Buyer_2,
//     Potential_Buyer_1_Contact_Details,
//     Potential_Buyer_1_Email,
//     MATCH(Item_Description)
//       AGAINST (? IN NATURAL LANGUAGE MODE) AS relevance
//   FROM product_data
//   WHERE MATCH(Item_Description)
//       AGAINST (? IN NATURAL LANGUAGE MODE)
//   ORDER BY relevance DESC
//   LIMIT ? OFFSET ?
// `;

//     const [rows] = await pool.query(query, [
//       combinedSearch,
//       combinedSearch,
//       Number(limit),
//       offset,
//     ]);

//     return res.json({
//       success: true,
//       page: Number(page),
//       limit: Number(limit),
//       searchedFor: itemDescription,
//       count: rows.length,
//       matches: rows.map(r => ({
//         id: r.id,
//         itemDescription: r.Item_Description,
//         quantity: r.Quantity,
//         uqc: r.UQC,
//         unitPrice: r.Unit_Price,
//         potentialBuyer1: r.Potential_Buyer_1,
//         potentialBuyer2: r.Potential_Buyer_2,
//         contactDetail: r.Potential_Buyer_1_Contact_Details,
//         email: r.Potential_Buyer_1_Email,
//         relevance: Number((r.relevance || 0).toFixed(3)),
//       }))
//     });
//   } catch (err) {
//     console.error("searchMatches error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server errorrrrrr",
//     });
//   }
// }

async function searchMatches(req, res) {
  try {
    const {
      itemDescription,
      page = 1,
      limit = 50,
      export: exportAll = "false",
    } = req.query;

    if (!itemDescription) {
      return res.status(400).json({
        success: false,
        message: "itemDescription query parameter is required",
      });
    }

    const isExport = exportAll === "true";
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    // 🔹 Split terms
    const searchTerms = itemDescription
      .split(/[, ]+/)
      .map(t => t.trim())
      .filter(Boolean);

    const booleanSearch = searchTerms.map(t => `${t}*`).join(" ");

    // 🔹 COUNT (for pagination)
    const countQuery = `
      SELECT COUNT(DISTINCT id) AS total
      FROM product_data
      WHERE
        MATCH(Item_Description) AGAINST (? IN BOOLEAN MODE)
        OR Item_Description_Search LIKE ?
        OR Item_Description_Alphanumeric LIKE ?
    `;

    const firstTerm = searchTerms[0].toLowerCase();
    const alphaNum = firstTerm.replace(/[^0-9]/g, "");

    const [[{ total }]] = await pool.query(countQuery, [
      booleanSearch,
      `%${firstTerm}%`,
      alphaNum ? `%${alphaNum}%` : "%",
    ]);

    // 🔹 MAIN QUERY
    const query = `
      SELECT DISTINCT
        id,
        Item_Description,
        Quantity,
        UQC,
        Unit_Price,
        Potential_Buyer_1,
        Potential_Buyer_2,
        Potential_Buyer_1_Contact_Details,
        Potential_Buyer_1_Email,
        MATCH(Item_Description)
          AGAINST (? IN BOOLEAN MODE) AS relevance
      FROM product_data
      WHERE
        MATCH(Item_Description) AGAINST (? IN BOOLEAN MODE)
        OR Item_Description_Search LIKE ?
        OR Item_Description_Alphanumeric LIKE ?
      ORDER BY relevance DESC
      ${isExport ? "" : "LIMIT ? OFFSET ?"}
    `;

    const params = [
      booleanSearch,
      booleanSearch,
      `%${firstTerm}%`,
      alphaNum ? `%${alphaNum}%` : "%",
    ];

    if (!isExport) {
      params.push(limitNum, offset);
    }

    const [rows] = await pool.query(query, params);

    return res.json({
      success: true,
      export: isExport,
      page: isExport ? null : pageNum,
      limit: isExport ? null : limitNum,
      totalRecords: total,
      totalPages: isExport ? 1 : Math.ceil(total / limitNum),
      searchedFor: itemDescription,
      searchTerms,
      count: rows.length,
      matches: rows.map(r => ({
        id: r.id,
        itemDescription: r.Item_Description,
        quantity: r.Quantity,
        uqc: r.UQC,
        unitPrice: r.Unit_Price,
        potentialBuyer1: r.Potential_Buyer_1,
        potentialBuyer2: r.Potential_Buyer_2,
        contactDetail: r.Potential_Buyer_1_Contact_Details,
        email: r.Potential_Buyer_1_Email,
        relevance: Number((r.relevance || 0).toFixed(3)),
      })),
    });

  } catch (err) {
    console.error("searchMatches error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
}


// async function searchMatches(req, res) {
//   try {
//     const { itemDescription } = req.query;

//     if (!itemDescription) {
//       return res.status(400).json({
//         success: false,
//         message: "itemDescription query parameter is required",
//       });
//     }

//     // Prepare search terms
//     const searchTerms = itemDescription
//       .split(",")
//       .map((term) => term.trim())
//       .filter((term) => term.length > 0);

//     if (searchTerms.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "At least one search term is required",
//       });
//     }

//     const MIN_FUZZY_LENGTH = 3;
//     const allMatchedProducts = [];
//     const searchResults = [];

//     for (const searchTerm of searchTerms) {
//       const cleanedWithSpaces = cleanSearchTerm(searchTerm);
//       const cleanedNoSpaces = alphanumericOnly(searchTerm);

//       // Term has no valid characters
//       if (!cleanedNoSpaces) {
//         searchResults.push({
//           searchTerm,
//           found: false,
//           count: 0,
//           reason: "Search term must contain letters or numbers",
//         });
//         continue;
//       }

//       // Build SQL
//       let query = `
//         SELECT * FROM product_management_data
//         WHERE
//           Item_Description_Search = ?
//           OR Item_Description_Search LIKE ?
//           OR Item_Description_Search LIKE ?
//           OR Item_Description_Search LIKE ?
//       `;

//       const params = [
//         cleanedWithSpaces,
//         `${cleanedWithSpaces} %`,
//         `% ${cleanedWithSpaces}`,
//         `% ${cleanedWithSpaces} %`,
//       ];

//       if (cleanedNoSpaces.length >= MIN_FUZZY_LENGTH) {
//         query += `
//           OR Item_Description_Alphanumeric = ?
//           OR Item_Description_Alphanumeric LIKE ?
//           OR Item_Description_Alphanumeric LIKE ?
//         `;
//         params.push(
//           cleanedNoSpaces,
//           `${cleanedNoSpaces}%`,
//           `%${cleanedNoSpaces}%`
//         );
//       }

//       query += ` ORDER BY Id ASC`;

//       const [matchedProducts] = await pool.query(query, params);

//       // Attach metadata to each product
//       for (const p of matchedProducts) {
//         p._searchTerm = searchTerm;
//         p._matchAccuracy = calculateMatchAccuracy(
//           searchTerm,
//           p.Item_Description
//         );
//       }

//       searchResults.push({
//         searchTerm,
//         found: matchedProducts.length > 0,
//         count: matchedProducts.length,
//       });

//       allMatchedProducts.push(...matchedProducts);
//     }

//     // Remove duplicates (same ID coming from different search terms)
//     const seenIds = new Set();
//     const uniqueProducts = [];

//     for (const product of allMatchedProducts) {
//       if (!seenIds.has(product.Id)) {
//         seenIds.add(product.Id);
//         uniqueProducts.push(product);
//       }
//     }

//     // FINAL RESPONSE — ALWAYS 200
//     return res.status(200).json({
//       success: true,
//       message:
//         uniqueProducts.length > 0
//           ? "Products matched successfully"
//           : "No matching products found",
//       searchedFor: itemDescription,
//       searchTerms,
//       searchResults,
//       matches: uniqueProducts, // full products
//       count: uniqueProducts.length,
//     });
//   } catch (err) {
//     console.error("Error in searchMatches:", err);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//       error: err.message,
//     });
//   }
// }

/**
 * API 3: GET ALL MATCHED PRODUCTS BY MATCH_ID
 * GET /api/matching/by-match-id/001
 */
async function getMatchesByMatchId(req, res) {
  try {
    const { matchId } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM Matching_Products WHERE Match_Id = ? ORDER BY Product_Id`,
      [matchId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No matches found for Match_Id: ${matchId}`,
      });
    }

    res.json({
      success: true,
      matchId: matchId,
      count: rows.length,
      searchedFor: rows[0].Product_Needed,
      customerInfo: {
        name: rows[0].Customer_Name,
        email: rows[0].Customer_Email,
        whatsapp: rows[0].Customer_Whatsapp_Number,
      },
      matches: rows,
    });
  } catch (err) {
    console.error("Error in getMatchesByMatchId:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
}

/**
 * API 4: GET ALL MATCHED PRODUCTS BY CUSTOMER EMAIL
 * GET /api/matching/by-customer?email=john@example.com
 */
async function getMatchesByCustomer(req, res) {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "email query parameter is required",
      });
    }

    const [rows] = await pool.query(
      `SELECT * FROM Matching_Products 
       WHERE Customer_Email = ? 
       ORDER BY Match_Id DESC, Product_Id`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No matches found for email: ${email}`,
      });
    }

    // Group by Match_Id
    const groupedMatches = {};
    rows.forEach((row) => {
      if (!groupedMatches[row.Match_Id]) {
        groupedMatches[row.Match_Id] = {
          matchId: row.Match_Id,
          customerInfo: {
            name: row.Customer_Name,
            email: row.Customer_Email,
            whatsapp: row.Customer_Whatsapp_Number,
            searchedFor: row.Product_Needed,
          },
          matches: [],
        };
      }
      groupedMatches[row.Match_Id].matches.push(row);
    });

    res.json({
      success: true,
      customerEmail: email,
      totalMatchSessions: Object.keys(groupedMatches).length,
      totalProducts: rows.length,
      data: Object.values(groupedMatches),
    });
  } catch (err) {
    console.error("Error in getMatchesByCustomer:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
}

/**
 * API 5: GET ALL MATCHES (with pagination)
 * GET /api/matching/all?page=1&limit=20
 */
async function getAllMatches(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT * FROM Matching_Products 
       ORDER BY Created_At DESC, Match_Id DESC, Product_Id 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) as total FROM Matching_Products"
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error in getAllMatches:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
}

/**
 * API 6: DELETE MATCH SESSION
 * DELETE /api/matching/:matchId
 */
async function deleteMatchSession(req, res) {
  try {
    const { matchId } = req.params;

    const [result] = await pool.query(
      `DELETE FROM Matching_Products WHERE Match_Id = ?`,
      [matchId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: `No matches found for Match_Id: ${matchId}`,
      });
    }

    res.json({
      success: true,
      message: "Match session deleted successfully",
      matchId: matchId,
      deletedProducts: result.affectedRows,
    });
  } catch (err) {
    console.error("Error in deleteMatchSession:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
}

export default {
  searchAndSaveMatches,
  searchMatches,
  getMatchesByMatchId,
  getMatchesByCustomer,
  getAllMatches,
  deleteMatchSession,
  toBooleanMode,
};
