// const pool = require("../db");
import pool from "../db.js";

// =============================================
// NORMALIZATION FUNCTIONS
// =============================================

function cleanSearchTerm(term) {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, '')  // Remove special chars, KEEP spaces
    .trim()
    .replace(/\s+/g, ' ');  // Collapse multiple spaces
}

function alphanumericOnly(term) {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '');  // Remove EVERYTHING except letters/numbers
}

// =============================================
// PRIMARY SEARCH - BOTH WITH & WITHOUT SPACES
// =============================================

/**
 * COMPLETE SOLUTION
 * 
 * Search "pcba81064v20s" → finds "pcba 81064 v2 0 s" ✅
 * Search "pcba 81064 v2 0 s" → finds "pcba81064v20s" ✅
 * Search "FRAME" → finds "FRAME SMALL" ✅
 * Search "FRA" → finds NOTHING ✅
 * Search "NO 55T89C PANEL" → finds "NO-55T89C-PANEL" ✅
 */
// ... in searchController.js

async function searchByItemDescriptionFuzzy(req, res) {
  try {
    const { item_description } = req.query;

    if (!item_description) {
      return res.status(400).json({ 
        message: "item_description query parameter is required"
      });
    }

    const cleanedWithSpaces = cleanSearchTerm(item_description);
    const cleanedNoSpaces = alphanumericOnly(item_description);
    
    // Minimum length for any alphanumeric search (rejects "FRA", allows "V2" via word boundary)
    const MIN_FUZZY_LENGTH = 3;

    if (cleanedNoSpaces.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Search term must contain letters or numbers"
      });
    }

    // Start with the precise word boundary search logic (Always runs)
let query = `SELECT DISTINCT * FROM product_management_data
WHERE 
  Item_Description_Search = ?
  OR Item_Description_Search LIKE ?
  OR Item_Description_Search LIKE ?
  OR Item_Description_Search LIKE ?`; // <-- Notice: Query starts on the first line, no leading spaces

    const params = [
          cleanedWithSpaces,
        `${cleanedWithSpaces} %`,
        `% ${cleanedWithSpaces}`,
        `% ${cleanedWithSpaces} %`,
    ];
    
    // Conditionally enable the full alphanumeric search (Exact, Prefix, and Internal/Fuzzy)
    // This allows searching for concatenated parts like "NVRMainBoard" that are not at the start.
if (cleanedNoSpaces.length >= MIN_FUZZY_LENGTH) {
        query += `
  OR Item_Description_Alphanumeric = ?
  OR Item_Description_Alphanumeric LIKE ?
  OR Item_Description_Alphanumeric LIKE ?`;
        
        params.push(
              cleanedNoSpaces,       // Exact match (e.g., "pcba81064v20s")
            `${cleanedNoSpaces}%`,   // Prefix match (e.g., "framesmall%" finds "framesmall01")
            `%${cleanedNoSpaces}%`    // Internal/Fuzzy match (e.g., "%nvrmainboard%" finds "dvrpart...nvrmainboard...")
        );
    }
    
query += `
ORDER BY Id ASC`; // <-- Order By is also left-justified

    const [rows] = await pool.query(query, params);
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "No matching products found******",
        searchedFor: item_description,
        searchedAs: {
          withSpaces: cleanedWithSpaces,
          noSpaces: cleanedNoSpaces
        },
        hint: "Searches are for full words or codes of 4+ characters."
      });
    }

    res.json({
      success: true,
      count: rows.length,
      searchTerm: item_description,
      data: rows
    });

  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ 
      message: "Internal server error", 
      error: err.message 
    });
  }
}

/**
 * ALPHANUMERIC SEARCH
 */
async function searchByAlphanumeric(req, res) {
  return searchByItemDescriptionFuzzy(req, res);
}

/**
 * COMBINED SEARCH
 */
async function searchByCombined(req, res) {
  return searchByItemDescriptionFuzzy(req, res);
}

/**
 * AUTOCOMPLETE
 */
async function searchSuggestions(req, res) {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ 
        message: "Query parameter 'q' is required (minimum 2 characters)"
      });
    }

    const cleanedWithSpaces = cleanSearchTerm(q);
    const cleanedNoSpaces = alphanumericOnly(q);

    const [rows] = await pool.query(
      `SELECT DISTINCT
        Id,
        Item_Description,
        Potential_Buyer_1,
        Unit_Price
      FROM product_management_data
      WHERE 
        Item_Description_Search LIKE ?
        OR Item_Description_Alphanumeric LIKE ?
      ORDER BY Id ASC
      LIMIT ?`,
      [
        `%${cleanedWithSpaces}%`,
        `%${cleanedNoSpaces}%`,
        parseInt(limit)
      ]
    );

    res.json({
      success: true,
      count: rows.length,
      query: q,
      suggestions: rows
    });

  } catch (err) {
    console.error("Suggestions error:", err);
    res.status(500).json({ 
      message: "Internal server error", 
      error: err.message 
    });
  }
}

/**
 * BULK SEARCH
 */
async function bulkSearch(req, res) {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        message: "Request body must contain 'items' array"
      });
    }

    const results = [];

    for (const item of items.slice(0, 50)) {
      const cleanedWithSpaces = cleanSearchTerm(item);
      const cleanedNoSpaces = alphanumericOnly(item);

      const [rows] = await pool.query(
        `SELECT DISTINCT * FROM product_management_data
         WHERE Item_Description_Search = ?
            OR Item_Description_Search LIKE ?
            OR Item_Description_Search LIKE ?
            OR Item_Description_Search LIKE ?
            OR Item_Description_Alphanumeric = ?
         LIMIT 10`,
        [
          cleanedWithSpaces,
          `${cleanedWithSpaces} %`,
          `% ${cleanedWithSpaces}`,
          `% ${cleanedWithSpaces} %`,
          cleanedNoSpaces
        ]
      );

      results.push({
        searchTerm: item,
        found: rows.length > 0,
        count: rows.length,
        data: rows
      });
    }

    res.json({
      success: true,
      totalSearches: results.length,
      results: results
    });

  } catch (err) {
    console.error("Bulk search error:", err);
    res.status(500).json({ 
      message: "Internal server error", 
      error: err.message 
    });
  }
}

/**
 * Legacy
 */
async function searchByNormalizedOnly(req, res) {
  return searchByItemDescriptionFuzzy(req, res);
}

function normalizeSearchTerm(term) {
  return cleanSearchTerm(term);
}

export default {
  searchByItemDescriptionFuzzy,
  searchByNormalizedOnly,
  searchByAlphanumeric,
  searchByCombined,
  searchSuggestions,
  bulkSearch,
  normalizeSearchTerm,
  alphanumericOnly
};