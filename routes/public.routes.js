const express = require('express');
const router = express.Router();
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const Property = require('../models/property.model');
const Wilaya = require('../models/wilaya.model');

// GET /api/properties - Get all available properties (public)
router.get('/properties',
  asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;
      const search = req.query.search || '';
      const wilayaId = req.query.wilayaId;

      // Build filter object
      const filter = { 
        available: true,
        isReserved: false 
      };

      // Add wilaya filter if provided
      if (wilayaId) {
        filter.wilayaId = wilayaId;
      }

      // Add search filter if provided
      if (search) {
        filter.$text = { $search: search };
      }

      // Get properties with pagination
      const properties = await Property.find(filter)
        .populate('wilayaId', 'name')
        .populate('officeId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      // Get total count for pagination
      const total = await Property.countDocuments(filter);

      sendSuccess(res, 'Properties retrieved successfully', {
        properties,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get public properties error:', error);
      sendError(res, 'Failed to retrieve properties', 500, error.message);
    }
  })
);

// GET /api/wilayas - Get all wilayas (public)
router.get('/wilayas',
  asyncHandler(async (req, res) => {
    try {
      const wilayas = await Wilaya.find()
        .sort({ name: 1 });

      sendSuccess(res, 'Wilayas retrieved successfully', { wilayas });
    } catch (error) {
      console.error('Get wilayas error:', error);
      sendError(res, 'Failed to retrieve wilayas', 500, error.message);
    }
  })
);

// GET /api/properties/:id - Get single property by ID (public)
router.get('/properties/:id',
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      const property = await Property.findById(id)
        .populate('wilayaId', 'name')
        .populate('officeId', 'name');

      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      // Only show available and not reserved properties
      if (!property.available || property.isReserved) {
        return sendError(res, 'Property not available', 404);
      }

      sendSuccess(res, 'Property retrieved successfully', { property });
    } catch (error) {
      console.error('Get public property error:', error);
      sendError(res, 'Failed to retrieve property', 500, error.message);
    }
  })
);

module.exports = router;
