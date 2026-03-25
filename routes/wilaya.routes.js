const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { adminOnly, adminOrSousAdmin } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const Wilaya = require('../models/wilaya.model');
const Office = require('../models/office.model');
const Property = require('../models/property.model');
const { body, validationResult } = require('express-validator');

// Validation rules for wilaya creation
const createWilayaValidation = [
  body('name')
    .notEmpty().withMessage('Wilaya name is required')
    .isLength({ max: 50 }).withMessage('Wilaya name cannot exceed 50 characters')
    .trim(),
  body('image')
    .optional()
    .custom((value) => {
      if (!value) return true;
      // Accept both URLs and base64 data URLs
      const urlRegex = /^https?:\/\/.+/;
      const base64Regex = /^data:image\/[a-z]+;base64,/;
      return urlRegex.test(value) || base64Regex.test(value);
    }).withMessage('Image must be a valid URL or base64 data')
    .trim()
];

// Validation rules for wilaya update
const updateWilayaValidation = [
  body('name')
    .optional()
    .isLength({ max: 50 }).withMessage('Wilaya name cannot exceed 50 characters')
    .trim(),
  body('image')
    .optional()
    .custom((value) => {
      if (!value) return true;
      // Accept both URLs and base64 data URLs
      const urlRegex = /^https?:\/\/.+/;
      const base64Regex = /^data:image\/[a-z]+;base64,/;
      return urlRegex.test(value) || base64Regex.test(value);
    }).withMessage('Image must be a valid URL or base64 data')
    .trim()
];

// POST /api/admin/wilayas - Create new wilaya
router.post('/',
  auth,
  adminOnly,
  createWilayaValidation,
  asyncHandler(async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 'Validation failed', 400, errors.array());
      }

      const { name, image } = req.body;

      // Check if wilaya with same name already exists
      const existingWilaya = await Wilaya.findOne({ name });

      if (existingWilaya) {
        return sendError(res, 'Wilaya with this name already exists', 409);
      }

      const wilaya = new Wilaya({ name, image });
      await wilaya.save();

      sendSuccess(res, 'Wilaya created successfully', { wilaya }, 201);
    } catch (error) {
      sendError(res, 'Failed to create wilaya', error);
    }
  })
);

// GET /api/admin/wilayas - Get all wilayas
router.get('/',
  auth,
  adminOrSousAdmin,
  asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 58; // Show all by default
      const skip = (page - 1) * limit;
      const search = req.query.search || '';

      // Build filter object
      const filter = {};
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } }
        ];
      }

      const wilayas = await Wilaya.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit);

      const total = await Wilaya.countDocuments(filter);

      sendSuccess(res, 'Wilayas retrieved successfully', {
        wilayas,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      sendError(res, 'Failed to retrieve wilayas', error);
    }
  })
);

// GET /api/admin/wilayas/:id - Get single wilaya by ID
router.get('/:id',
  auth,
  adminOrSousAdmin,
  asyncHandler(async (req, res) => {
    try {
      const wilaya = await Wilaya.findById(req.params.id);
      
      if (!wilaya) {
        return sendError(res, 'Wilaya not found', 404);
      }

      sendSuccess(res, 'Wilaya retrieved successfully', { wilaya });
    } catch (error) {
      sendError(res, 'Failed to retrieve wilaya', error);
    }
  })
);

// PUT /api/admin/wilayas/:id - Update wilaya
router.put('/:id',
  auth,
  adminOnly,
  updateWilayaValidation,
  asyncHandler(async (req, res) => {
    try {
      console.log('PUT /api/admin/wilayas/:id - Request received');
      console.log('Request params:', req.params);
      console.log('Request body:', req.body);
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
        return sendError(res, 'Validation failed', 400, errors.array());
      }

      const { name, image } = req.body;
      const wilayaId = req.params.id;
      
      console.log('Extracted data:', { name, image, wilayaId });

      // Check if wilaya exists
      const wilaya = await Wilaya.findById(wilayaId);
      if (!wilaya) {
        console.log('Wilaya not found with ID:', wilayaId);
        return sendError(res, 'Wilaya not found', 404);
      }
      
      console.log('Found wilaya:', wilaya);

      // Check if another wilaya with same name exists
      if (name && name !== wilaya.name) {
        console.log('Checking for duplicate name:', name);
        const existingWilaya = await Wilaya.findOne({
          _id: { $ne: wilayaId },
          name
        });

        if (existingWilaya) {
          console.log('Duplicate wilaya found:', existingWilaya);
          return sendError(res, 'Wilaya with this name already exists', 409);
        }
      }

      // Update wilaya
      if (name) wilaya.name = name;
      if (image) wilaya.image = image;
      
      console.log('Updated wilaya data:', wilaya);

      await wilaya.save();
      console.log('Wilaya saved successfully');

      sendSuccess(res, 'Wilaya updated successfully', { wilaya });
    } catch (error) {
      console.error('Error updating wilaya:', error);
      sendError(res, 'Failed to update wilaya', error);
    }
  })
);

// DELETE /api/admin/wilayas/:id - Delete wilaya
router.delete('/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const wilayaId = req.params.id;

      // Check if wilaya exists
      const wilaya = await Wilaya.findById(wilayaId);
      if (!wilaya) {
        return sendError(res, 'Wilaya not found', 404);
      }

      // Check if wilaya has related offices or properties
      const [officeCount, propertyCount] = await Promise.all([
        Office.countDocuments({ wilayaId }),
        Property.countDocuments({ wilayaId })
      ]);

      if (officeCount > 0 || propertyCount > 0) {
        return sendError(res, 'Cannot delete wilaya with existing offices or properties', 400);
      }

      await Wilaya.findByIdAndDelete(wilayaId);

      sendSuccess(res, 'Wilaya deleted successfully', { wilaya });
    } catch (error) {
      sendError(res, 'Failed to delete wilaya', error);
    }
  })
);

module.exports = router;
