// const pool = require("../db");
import pool from "../db.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function validatePagination(page, limit) {
  const validPage = Math.max(1, parseInt(page) || DEFAULT_PAGE);
  const validLimit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(limit) || DEFAULT_LIMIT)
  );
  const offset = (validPage - 1) * validLimit;
  return { page: validPage, limit: validLimit, offset };
}

function validateProductMatch(itemDescription, ProductReq) {
  if (!itemDescription || !ProductReq) {
    console.log(
      `❌ Validation failed: Missing data - Item: "${itemDescription}", Needed: "${ProductReq}"`
    );
    return false;
  }

  const item = itemDescription.toString().toLowerCase().trim();
  const needed = ProductReq.toString().toLowerCase().trim();

  // Check for exact match or partial match (either direction)
  const isMatch =
    item === needed || item.includes(needed) || needed.includes(item);

  console.log(
    `🔍 Validation: "${item}" vs "${needed}" = ${
      isMatch ? "✅ MATCH" : "❌ NO MATCH"
    }`
  );

  return isMatch;
}

/**
 * Generate WhatsApp RFQ message
 */
function generateWhatsAppMessage(rfqId, productName) {
  return `🔔 *New RFQ Request from Opt2Deal*

📋 *RFQ ID:* ${rfqId}
🏢 *Product:* ${productName}

❓ *Question:* Do you have this product available?

Please respond with:
✅ Yes - Available
❌ No - Not Available`;
}

/**
 * Map business fields to database fields
 * Supports multiple field name variations
 */
function mapVendorResponseFields(body) {
  const mapped = {
    rfqId: null,
    status: "0", // ✅ CHANGED: Default status to '0' (Not Available)
    currentAvailability: null,
    quantity: null,
    price: null,
    location: null,
  };

  // RFQ ID (required)
  mapped.rfqId = body.rfqId || body.RFQ_Id || body.id;

  // Status mapping from productAvailable
  const productAvailable =
    body.productAvailable || body.product_available || body.available;
  if (productAvailable) {
    const availStr = productAvailable.toString().toLowerCase().trim();
    if (
      availStr === "yes" ||
      availStr === "y" ||
      availStr === "available" ||
      availStr === "true"
    ) {
      mapped.status = "1";
    } else if (
      availStr === "no" ||
      availStr === "n" ||
      availStr === "not available" ||
      availStr === "false"
    ) {
      mapped.status = "0";
    } else if (availStr === "pending") {
      mapped.status = "pending";
    }
  }

  // If status is directly provided, use it
  if (body.status) {
    mapped.status = body.status;
  }

  // Current Availability (vendorAvailability)
  mapped.currentAvailability =
    body.vendorAvailability ||
    body.vendor_availability ||
    body.currentAvailability ||
    body.availability ||
    null;

  // Quantity
  mapped.quantity =
    body.availableQty ||
    body.available_qty ||
    body.quantity ||
    body.qty ||
    null;

  // Price
  mapped.price =
    body.vendorPrice ||
    body.vendor_price ||
    body.price ||
    body.bestPrice ||
    null;

  // Location
  mapped.location =
    body.vendorLocation || body.vendor_location || body.location || null;

  return mapped;
}

/**
 * Format status text for display
 */
function formatStatusText(status, availability) {
  if (!status) return "Unknown Status";

  const statusStr = status.toString();

  if (statusStr === "pending") {
    return "Pending Response";
  } else if (statusStr === "1") {
    if (availability === "immediate") {
      return "Available - Immediate";
    } else if (availability && availability.includes("days")) {
      return `Available - ${availability}`;
    }
    return "Available";
  } else if (statusStr === "0") {
    return "Not Available";
  }

  return "Unknown Status";
}

/**
 * Format vendor response for API output
 */
function formatVendorResponse(rfqRecord) {
  return {
    rfqId: rfqRecord.RFQ_Id,
    matchId: rfqRecord.Match_Id,
    vendorItemId: rfqRecord.Vendor_Item_Id,
    vendorName: rfqRecord.Vendor_Name,
    vendorContact: rfqRecord.Vendor_Contact,
    ProductReq: rfqRecord.Product_Req,
    status: rfqRecord.Status,
    statusText: formatStatusText(
      rfqRecord.Status,
      rfqRecord.Current_Availability
    ),
    currentAvailability: rfqRecord.Current_Availability,
    location: rfqRecord.Location,
    quantity: rfqRecord.Available_Quantity,
    bestPrice: rfqRecord.Best_Price,
    rfqSentAt: rfqRecord.RFQ_Sent_At,
    responseReceivedAt: rfqRecord.Response_Received_At,
    createdAt: rfqRecord.Created_At,
    updatedAt: rfqRecord.Updated_At,
  };
}

// =============================================
// API 1: CREATE RFQ (Send RFQ to Vendors) - FIXED WITH VALIDATION + WHATSAPP MESSAGE
// =============================================

/**
 * POST /api/rfq/create
 * Create RFQ requests for matched products with Item_Description validation
 *
 * Body: {
 *   matchId: 5,
 *   vendorItemIds: [9402] // Optional: specific vendor items, otherwise all from match
 * }
 */
async function createRFQ(req, res) {
  const conn = await pool.getConnection();

  try {
    const { matchId, vendorItemIds } = req.body;

    // Validate matchId
    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: "matchId is required",
      });
    }

    await conn.beginTransaction();

    // Get matching_products record
    const [matchRecords] = await conn.query(
      "SELECT * FROM matching_products WHERE Match_Id = ?",
      [matchId]
    );

    if (matchRecords.length === 0) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: `No matching products found for Match_Id: ${matchId}`,
      });
    }

    const matchRecord = matchRecords[0];
    const ProductReq = matchRecord.Product_Req;

    if (!ProductReq) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Product_Req is missing in matching_products record",
      });
    }

    console.log(`📋 Product Needed: ${ProductReq}`);

    // Build query based on whether vendorItemIds is provided
    let productsQuery;
    let productsParams;

    if (
      vendorItemIds &&
      Array.isArray(vendorItemIds) &&
      vendorItemIds.length > 0
    ) {
      // CASE 1: Specific vendor items requested
      productsQuery = `SELECT * FROM Product_Management_Data WHERE Id IN (${vendorItemIds
        .map(() => "?")
        .join(",")})`;
      productsParams = vendorItemIds;

      console.log(
        `✅ Creating RFQ for ${
          vendorItemIds.length
        } specific vendor items: ${vendorItemIds.join(", ")}`
      );
    } else {
      // CASE 2: No specific items - send to ALL vendors in match
      const productIds = matchRecord.Product_Ids
        ? matchRecord.Product_Ids.split(",").map((id) => parseInt(id.trim()))
        : [];

      if (productIds.length === 0) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "No product IDs found in matching record",
        });
      }

      productsQuery = `SELECT * FROM Product_Management_Data WHERE Id IN (${productIds
        .map(() => "?")
        .join(",")})`;
      productsParams = productIds;

      console.log(
        `✅ Creating RFQ for ALL ${productIds.length} vendor items from match`
      );
    }

    const [products] = await conn.query(productsQuery, productsParams);

    if (products.length === 0) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "No products found to send RFQ",
        hint: vendorItemIds
          ? "Vendor item IDs not found in database"
          : "No products in matching record",
      });
    }

    // ✅ NEW: Validate and filter products by Item_Description
    // ✅ Replace the entire validation section with this:
    const validProducts = [];
    const invalidProducts = [];

    // Get the Product_Ids from the match record
    const matchProductIds = matchRecord.Product_Ids
      ? matchRecord.Product_Ids.split(",").map((id) => parseInt(id.trim()))
      : [];

    console.log(`\n🔍 Starting validation for ${products.length} products...`);
    console.log(
      `📋 Valid Product IDs for Match_Id ${matchId}: [${matchProductIds.join(
        ", "
      )}]\n`
    );

    for (const product of products) {
      console.log(`\n--- Validating Vendor Item ${product.Id} ---`);
      console.log(`Vendor: ${product.Potential_Buyer_1}`);

      // Check if product has Item_Description
      if (!product.Item_Description) {
        console.log(`⚠️ SKIP: No Item_Description found`);
        invalidProducts.push({
          vendorItemId: product.Id,
          vendorName: product.Potential_Buyer_1,
          reason: "Missing Item_Description",
          itemDescription: null,
          ProductReq: ProductReq,
        });
        continue;
      }

      // ✅ Check if product ID is in the match's Product_Ids list
      if (!matchProductIds.includes(product.Id)) {
        console.log(
          `❌ SKIP: Product ID ${product.Id} not in match's Product_Ids`
        );
        invalidProducts.push({
          vendorItemId: product.Id,
          vendorName: product.Potential_Buyer_1,
          itemDescription: product.Item_Description,
          ProductReq: ProductReq,
          reason: `Product ID ${product.Id} does not belong to Match_Id ${matchId}`,
        });
        continue;
      }

      console.log(`✅ VALID: Adding to RFQ list`);
      validProducts.push(product);
    }

    console.log(`\n📊 Validation Summary:`);
    console.log(`✅ Valid: ${validProducts.length}`);
    console.log(`❌ Invalid: ${invalidProducts.length}`);
    console.log(`📋 Total: ${products.length}\n`);

    // If no valid products found
    if (validProducts.length === 0) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message:
          "No valid products found - Item_Description does not match Product_Req",
        ProductReq: ProductReq,
        invalidProducts: invalidProducts,
        hint: "The vendor products' Item_Description must match the Product_Req from matching_products",
      });
    }

    // Create RFQ records for valid products (allowing duplicates)
    const rfqRecords = [];

    for (const product of validProducts) {
      // ✅ CHANGED: Status is now 'pending' by default when creating RFQ
      const [result] = await conn.query(
        `INSERT INTO rfq_responses 
          (Match_Id, Vendor_Item_Id, Vendor_Name, Vendor_Contact, Product_Req, Status, Current_Availability, RFQ_Sent_At)
         VALUES (?, ?, ?, ?, ?, 'pending', NULL, NOW())`,
        [
          matchId,
          product.Id,
          product.Potential_Buyer_1 || "Unknown Vendor",
          product.Potential_Buyer_1_Contact_Detail || null,
          ProductReq, // Use Product_Req from matching_products
        ]
      );

      const rfqId = result.insertId;
      console.log(`✅ Created RFQ_Id: ${rfqId} for Vendor Item ${product.Id}`);

      // ✅ NEW: Generate WhatsApp message for each RFQ
      const whatsappMessage = generateWhatsAppMessage(rfqId, ProductReq);

      rfqRecords.push({
        rfqId: rfqId,
        vendorItemId: product.Id,
        vendorName: product.Potential_Buyer_1,
        vendorContact: product.Potential_Buyer_1_Contact_Detail,
        itemDescription: product.Item_Description,
        ProductReq: ProductReq,
        status: "pending",
        currentAvailability: null,
        whatsappMessage: whatsappMessage, // ✅ ADDED: WhatsApp message for n8n
      });
    }

    await conn.commit();

    console.log(
      `✅ Successfully created ${rfqRecords.length} RFQ records for Match ID ${matchId}`
    );

    const response = {
      success: true,
      message: `🔔 *New RFQ Request from Opt2Deal*

📋 *RFQ ID:* ${rfqRecords[0].rfqId}
🏢 *Product:* ${ProductReq}

❓ *Question:* Do you have this product available?

Please respond with:
✅ Yes - Available
❌ No - Not Available`, // ✅ CHANGED: Added heading to API message
      data: {
        matchId,
        ProductReq: ProductReq,
        totalRFQsSent: rfqRecords.length,
        rfqRecords,
      },
    };

    // Include validation warnings if some products were invalid
    if (invalidProducts.length > 0) {
      response.warnings = {
        message: `${invalidProducts.length} product(s) were skipped due to validation errors`,
        invalidProducts: invalidProducts,
      };
    }

    res.status(201).json(response);
  } catch (err) {
    await conn.rollback();
    console.error("❌ Error creating RFQ:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  } finally {
    conn.release();
  }
}

async function updateRFQResponse(req, res) {
  const conn = await pool.getConnection();

  try {
    // Map incoming fields to standard format
    const mapped = mapVendorResponseFields(req.body);

    console.log("📥 Received data:", req.body);
    console.log("🗺️  Mapped data:", mapped);

    // Validate required fields
    if (!mapped.rfqId) {
      return res.status(400).json({
        success: false,
        message: "rfqId is required",
        receivedFields: Object.keys(req.body),
        hint: "Provide rfqId or RFQ_Id or id",
      });
    }

    // ✅ CHANGED: Status is no longer required - defaults to '0' if not provided
    if (!mapped.status) {
      mapped.status = "0"; // Default to Not Available
    }

    await conn.beginTransaction();

    // Check if RFQ exists
    const [rfqRecords] = await conn.query(
      "SELECT * FROM rfq_responses WHERE RFQ_Id = ?",
      [mapped.rfqId]
    );

    if (rfqRecords.length === 0) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: `RFQ not found with ID: ${mapped.rfqId}`,
      });
    }

    // Build update query dynamically
    const updateFields = [];
    const updateParams = [];

    // Always update status
    updateFields.push("Status = ?");
    updateParams.push(mapped.status);

    // Update availability if provided
    if (
      mapped.currentAvailability !== null &&
      mapped.currentAvailability !== undefined
    ) {
      updateFields.push("Current_Availability = ?");
      updateParams.push(mapped.currentAvailability);
    }

    // Update quantity if provided
    // Update quantity if provided and valid
    if (mapped.quantity !== null && mapped.quantity !== undefined) {
      const parsedQty = parseInt(mapped.quantity);

      updateFields.push("Available_Quantity = ?");
      updateParams.push(Number.isNaN(parsedQty) ? 0 : parsedQty);
    }

    // Update price if provided
    // Update price if provided and valid
    if (mapped.price !== null && mapped.price !== undefined) {
      const parsedPrice = parseFloat(mapped.price);

      if (!Number.isNaN(parsedPrice)) {
        updateFields.push("Best_Price = ?");
        updateParams.push(parsedPrice);
      } else {
        updateFields.push("Best_Price = ?");
        updateParams.push(null); // ✅ Store NULL instead of NaN
      }
    }

    // Update location if provided
    if (mapped.location !== null && mapped.location !== undefined) {
      updateFields.push("Location = ?");
      updateParams.push(mapped.location);
    }

    // Always update timestamps
    updateFields.push("Response_Received_At = NOW()");
    updateFields.push("Updated_At = NOW()");

    // Build final query
    const updateQuery = `UPDATE rfq_responses SET ${updateFields.join(
      ", "
    )} WHERE RFQ_Id = ?`;
    updateParams.push(mapped.rfqId);

    console.log("🔄 Update Query:", updateQuery);
    console.log("🔄 Update Params:", updateParams);

    // Execute update
    const [updateResult] = await conn.query(updateQuery, updateParams);

    // Get updated record
    const [updatedRecords] = await conn.query(
      "SELECT * FROM rfq_responses WHERE RFQ_Id = ?",
      [mapped.rfqId]
    );

    await conn.commit();

    console.log(
      `✅ RFQ Response Updated: RFQ_Id=${mapped.rfqId}, Status=${mapped.status}, Rows Affected=${updateResult.affectedRows}`
    );

    res.json({
      success: true,
      message: "RFQ response updated successfully",
      data: formatVendorResponse(updatedRecords[0]),
      // debug: {
      //   receivedFields: Object.keys(req.body),
      //   mappedFields: mapped,
      //   rowsAffected: updateResult.affectedRows,
      //   fieldsUpdated: updateFields.length - 2, // Exclude timestamps
      // },
    });
  } catch (err) {
    await conn.rollback();
    console.error("❌ Error updating RFQ response:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  } finally {
    conn.release();
  }
}

async function getRFQById(req, res) {
  try {
    const rfqId = parseInt(req.params.rfqId);

    if (isNaN(rfqId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid RFQ ID",
      });
    }

    const [rfqRecords] = await pool.query(
      "SELECT * FROM rfq_responses WHERE RFQ_Id = ?",
      [rfqId]
    );

    if (rfqRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: `RFQ not found with ID: ${rfqId}`,
      });
    }

    res.json({
      success: true,
      data: formatVendorResponse(rfqRecords[0]),
    });
  } catch (err) {
    console.error("Error fetching RFQ:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

async function getRFQsByMatchId(req, res) {
  try {
    const matchId = parseInt(req.params.matchId);

    if (isNaN(matchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Match ID",
      });
    }

    const [rfqRecords] = await pool.query(
      "SELECT * FROM rfq_responses WHERE Match_Id = ? ORDER BY Created_At DESC",
      [matchId]
    );

    if (rfqRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No RFQs found for Match ID: ${matchId}`,
      });
    }

    // Calculate statistics
    const stats = {
      total: rfqRecords.length,
      pending: rfqRecords.filter((r) => r.Status === "pending").length,
      available: rfqRecords.filter((r) => r.Status === "1").length,
      notAvailable: rfqRecords.filter((r) => r.Status === "0").length,
      immediate: rfqRecords.filter(
        (r) => r.Current_Availability === "immediate"
      ).length,
      withLeadTime: rfqRecords.filter(
        (r) => r.Current_Availability && r.Current_Availability.includes("days")
      ).length,
    };

    res.json({
      success: true,
      matchId,
      statistics: stats,
      data: rfqRecords.map(formatVendorResponse),
    });
  } catch (err) {
    console.error("Error fetching RFQs by match ID:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

async function getAllRFQs(req, res) {
  try {
    const { status, matchId, vendorName, page, limit } = req.query;
    const {
      page: validPage,
      limit: validLimit,
      offset,
    } = validatePagination(page, limit);

    // Build WHERE clause
    const whereConditions = [];
    const params = [];

    if (status) {
      whereConditions.push("Status = ?");
      params.push(status);
    }

    if (matchId) {
      whereConditions.push("Match_Id = ?");
      params.push(parseInt(matchId));
    }

    if (vendorName) {
      whereConditions.push("Vendor_Name LIKE ?");
      params.push(`%${vendorName}%`);
    }

    const whereClause =
      whereConditions.length > 0
        ? "WHERE " + whereConditions.join(" AND ")
        : "";

    // Get paginated results
    const query = `
      SELECT * FROM rfq_responses 
      ${whereClause}
      ORDER BY Created_At DESC
      LIMIT ? OFFSET ?
    `;
    const [rfqRecords] = await pool.query(query, [
      ...params,
      validLimit,
      offset,
    ]);

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM rfq_responses ${whereClause}`;
    const [[{ total }]] = await pool.query(countQuery, params);

    res.json({
      success: true,
      data: rfqRecords.map(formatVendorResponse),
      pagination: {
        currentPage: validPage,
        pageSize: validLimit,
        totalRecords: total,
        totalPages: Math.ceil(total / validLimit),
      },
    });
  } catch (err) {
    console.error("Error fetching all RFQs:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

async function deleteRFQ(req, res) {
  try {
    const rfqId = parseInt(req.params.rfqId);

    if (isNaN(rfqId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid RFQ ID",
      });
    }

    const [result] = await pool.query(
      "DELETE FROM rfq_responses WHERE RFQ_Id = ?",
      [rfqId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: `RFQ not found with ID: ${rfqId}`,
      });
    }

    res.json({
      success: true,
      message: "RFQ deleted successfully",
      rfqId,
    });
  } catch (err) {
    console.error("Error deleting RFQ:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

async function getRFQStatistics(req, res) {
  try {
    const { matchId } = req.query;

    let whereClause = "";
    const params = [];

    if (matchId) {
      whereClause = "WHERE Match_Id = ?";
      params.push(parseInt(matchId));
    }

    const [[stats]] = await pool.query(
      `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN Status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN Status = '1' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN Status = '0' THEN 1 ELSE 0 END) as notAvailable,
        SUM(CASE WHEN Current_Availability = 'immediate' THEN 1 ELSE 0 END) as immediate,
        SUM(CASE WHEN Current_Availability LIKE '%days%' THEN 1 ELSE 0 END) as withLeadTime,
        AVG(CASE WHEN Status = '1' AND Best_Price IS NOT NULL THEN Best_Price END) as avgPrice,
        AVG(
          CASE 
            WHEN Current_Availability LIKE '%days%' 
            THEN CAST(SUBSTRING_INDEX(Current_Availability, ' ', 1) AS UNSIGNED)
            ELSE NULL 
          END
        ) as avgLeadTime
      FROM rfq_responses
      ${whereClause}
    `,
      params
    );

    res.json({
      success: true,
      statistics: {
        total: stats.total || 0,
        pending: stats.pending || 0,
        available: stats.available || 0,
        notAvailable: stats.notAvailable || 0,
        immediate: stats.immediate || 0,
        withLeadTime: stats.withLeadTime || 0,
        averagePrice: stats.avgPrice
          ? parseFloat(stats.avgPrice).toFixed(2)
          : null,
        averageLeadTimeDays: stats.avgLeadTime
          ? Math.round(stats.avgLeadTime)
          : null,
        responseRate:
          stats.total > 0
            ? (((stats.total - stats.pending) / stats.total) * 100).toFixed(2) +
              "%"
            : "0%",
      },
    });
  } catch (err) {
    console.error("Error fetching RFQ statistics:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

export default {
  createRFQ,
  updateRFQResponse,
  getRFQById,
  getRFQsByMatchId,
  getAllRFQs,
  deleteRFQ,
  getRFQStatistics,
};
