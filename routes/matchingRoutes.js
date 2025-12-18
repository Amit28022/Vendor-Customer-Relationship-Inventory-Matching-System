// const express = require("express");
// const router = express.Router();
import express from "express";
// import router from "express";

const router = express.Router();
// Import BOTH controllers
import matchingController from "../controllers/matchingController.js"; // Your existing one
import customerRequestController from "../controllers/customerRequestController.js"; // New one

// =============================================
// OLD ROUTES (Your existing ones - UNCHANGED)
// =============================================

router.post("/search-and-save", matchingController.searchAndSaveMatches);
router.get("/search", matchingController.searchMatches);
router.get("/by-match-id/:matchId", matchingController.getMatchesByMatchId);
router.get("/by-customer", matchingController.getMatchesByCustomer);
router.get("/all", matchingController.getAllMatches);
router.delete("/:matchId", matchingController.deleteMatchSession);

// =============================================
// NEW CUSTOMER REQUEST ROUTES
// =============================================

/**
 * POST - Save customer request
 * Searches products and saves aggregated data in ONE row
 */
router.post(
  "/customer-request",
  customerRequestController.saveCustomerRequest
);

/**
 * GET - Get all customer requests (with filters)
 * Query params: customerId, customerEmail, page, limit
 */
router.get(
  "/customer-requests/all",
  customerRequestController.getAllCustomerRequests
);

/**
 * GET - Get ALL customer requests WITH FULL PRODUCT DETAILS
 * Returns combined data from both tables for all customers
 */
router.get(
  "/customer-requests/details",
  customerRequestController.getAllCustomerRequestsWithDetails
);

/**
 * GET - Get customer request by Match ID (basic info)
 */
router.get(
  "/customer-request/:matchId",
  customerRequestController.getCustomerRequestById
);

/**
 * GET - Get customer request with full product details
 */
router.get(
  "/customer-request/:matchId/details",
  customerRequestController.getCustomerRequestWithDetails
);

/**
 * DELETE - Delete customer request
 */
router.delete(
  "/customer-request/:matchId",
  customerRequestController.deleteCustomerRequest
);

router.get(
  "/customer-request/:matchId/full",
  customerRequestController.getCustomerRequestFullByMatchId
);

export default router;