// rfqRoutes.js
// const express = require("express");
// const router = express.Router();
import express from "express";
// import router from "express";
import rfqController from "../controllers/rfqController.js";

const router = express.Router();

// const rfqController = require("../controllers/rfqController");

const validateRFQId = (req, res, next) => {
  const { rfqId } = req.params;
  const numericId = parseInt(rfqId, 10);

  if (isNaN(numericId) || numericId < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid RFQ ID. Must be a positive integer.",
    });
  }

  req.params.rfqId = numericId;
  next();
};

const validateMatchId = (req, res, next) => {
  const { matchId } = req.params;
  const numericId = parseInt(matchId, 10);

  if (isNaN(numericId) || numericId < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid Match ID. Must be a positive integer.",
    });
  }

  req.params.matchId = numericId;
  next();
};

const validatePagination = (req, res, next) => {
  const { page, limit } = req.query;

  if (page && (isNaN(parseInt(page)) || parseInt(page) < 1)) {
    return res.status(400).json({
      success: false,
      message: "Invalid page number. Must be a positive integer.",
    });
  }

  if (limit && (isNaN(parseInt(limit)) || parseInt(limit) < 1)) {
    return res.status(400).json({
      success: false,
      message: "Invalid limit. Must be a positive integer.",
    });
  }

  next();
};

const logRequest = (req, res, next) => {
  if (process.env.NODE_ENV === "development") {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
};

router.post("/create", rfqController.createRFQ);
router.post("/response", rfqController.updateRFQResponse);
router.get("/statistics", rfqController.getRFQStatistics);
router.get("/all", validatePagination, rfqController.getAllRFQs);
router.get(
  "/by-match/:matchId",
  validateMatchId,
  rfqController.getRFQsByMatchId
);
router.get("/:rfqId", validateRFQId, rfqController.getRFQById);
router.delete("/:rfqId", validateRFQId, rfqController.deleteRFQ);

router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "RFQ route not found",
    path: req.path,
    method: req.method,
    availableRoutes: {
      create: ["POST /create - Create RFQ for matched products"],
      update: ["POST /response - Update RFQ with vendor response (webhook)"],
      read: [
        "GET /statistics - Get RFQ statistics",
        "GET /all - Get all RFQs (with filters)",
        "GET /by-match/:matchId - Get RFQs by Match ID",
        "GET /:rfqId - Get RFQ by ID",
      ],
      delete: ["DELETE /:rfqId - Delete RFQ"],
    },
  });
});

router.use((err, req, res, next) => {
  console.error("RFQ route error:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    error:
      process.env.NODE_ENV === "development"
        ? {
            stack: err.stack,
            details: err,
          }
        : undefined,
  });
});

export default router;
