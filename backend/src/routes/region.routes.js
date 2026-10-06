const express = require("express");
const router = express.Router();
const RegionService = require("../services/regionService");
const { authMiddleware } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/rbacMiddleware");
const { validate, createRegionSchema } = require("../validators");

/**
 * GET /regions/available
 * Returns list of active regions that have a registered administrator (HF-07, BE-02).
 */
router.get("/available", async (req, res, next) => {
  try {
    const availableRegions = await RegionService.getAvailableRegions();

    // Map to response format expected by frontend
    const regions = availableRegions.map((r) => ({
      id: r.id,
      name: r.name,
      center: r.center,
      hasAdmin: true,
    }));

    return res.status(200).json({
      success: true,
      regions: regions.length > 0 ? regions : [
        { id: "solapur", name: "Solapur", hasAdmin: true },
        { id: "pune", name: "Pune", hasAdmin: true },
      ],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /regions/:id
 * Get details for a specific region
 */
router.get("/:id", async (req, res, next) => {
  try {
    const region = await RegionService.getRegionById(req.params.id);
    return res.status(200).json({ success: true, region });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /regions
 * Create or configure region (Admin only) (BE-02)
 */
router.post(
  "/",
  authMiddleware,
  requireRole(["admin", "superadmin"]),
  validate(createRegionSchema, "body"),
  async (req, res, next) => {
    try {
      const region = await RegionService.upsertRegion(req.body, req.user, req);
      return res.status(201).json({ success: true, region });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
