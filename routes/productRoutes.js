import express from "express";
import multer from "multer";
import productController from "../controllers/productController.js";

const router = express.Router();

// ❌ dynamic import removed (was wrong)
import searchController from "../controllers/searchController.js";

// ===============================
// MULTER CONFIG
// ===============================
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, "uploads/");
  },
  filename(req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// ===============================
// UPLOAD ROUTE
// ===============================
router.post(
  "/upload-csv",
  upload.single("file"),
  productController.uploadCSV
);

// ===============================
// SEARCH ROUTES
// ===============================
router.get("/search/fuzzy", searchController.searchByItemDescriptionFuzzy);
router.get("/search/normalized", searchController.searchByNormalizedOnly);
router.get("/search/alphanumeric", searchController.searchByAlphanumeric);
router.get("/search/combined", searchController.searchByCombined);
router.get("/search/suggestions", searchController.searchSuggestions);
router.post("/search/bulk", searchController.bulkSearch);
router.get(
  "/search/by-item-description",
  searchController.searchByItemDescriptionFuzzy
);

// ===============================
// OTHER ROUTES
// ===============================
router.get("/cursor", productController.getProductsCursor);
router.get("/all", productController.getAllProducts);

// ===============================
// STANDARD ROUTES
// ===============================
router.get("/", productController.getProductsPaginated);
router.post("/", productController.createProduct);

// ===============================
// ID ROUTES (LAST)
// ===============================
router.get("/:id", productController.getProductById);
router.put("/:id", productController.updateProduct);
router.patch("/:id", productController.updateProduct);
router.delete("/:id", productController.deleteProduct);

export default router;
