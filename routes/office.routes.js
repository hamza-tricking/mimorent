const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { adminOnly, employerOnly } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const Office = require('../models/office.model');
const Wilaya = require('../models/wilaya.model');
const User = require('../models/user.model');
const { body, validationResult } = require('express-validator');

// Validation rules for office creation
const createOfficeValidation = [
  body('name')
    .notEmpty().withMessage('Office name is required')
    .isLength({ max: 100 }).withMessage('Office name cannot exceed 100 characters')
    .trim(),
  body('address')
    .notEmpty().withMessage('Address is required')
    .isLength({ max: 200 }).withMessage('Address cannot exceed 200 characters')
    .trim(),
  body('phone')
    .notEmpty().withMessage('Phone number is required')
    .isLength({ max: 20 }).withMessage('Phone number cannot exceed 20 characters')
    .trim(),
  body('wilayaId')
    .notEmpty().withMessage('Wilaya ID is required')
    .isMongoId().withMessage('Invalid Wilaya ID')
];

// Validation rules for office update
const updateOfficeValidation = [
  body('name')
    .optional()
    .isLength({ max: 100 }).withMessage('Office name cannot exceed 100 characters')
    .trim(),
  body('address')
    .optional()
    .isLength({ max: 200 }).withMessage('Address cannot exceed 200 characters')
    .trim(),
  body('phone')
    .optional()
    .isLength({ max: 20 }).withMessage('Phone number cannot exceed 20 characters')
    .trim(),
  body('wilayaId')
    .optional()
    .isMongoId().withMessage('Invalid Wilaya ID')
];

// POST /api/admin/offices - Create new office
router.post('/',
  auth,
  adminOnly,
  createOfficeValidation,
  asyncHandler(async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 'Validation failed', 400, errors.array());
      }

      const { name, address, phone, wilayaId } = req.body;

      // Check if wilaya exists
      const wilaya = await Wilaya.findById(wilayaId);
      if (!wilaya) {
        return sendError(res, 'Wilaya not found', 404);
      }

      const office = new Office({ name, address, phone, wilayaId });
      await office.save();

      // Populate wilaya info for response
      await office.populate('wilayaId', 'name code');

      sendSuccess(res, 'Office created successfully', { office }, 201);
    } catch (error) {
      sendError(res, 'Failed to create office', error);
    }
  })
);

// GET /api/admin/offices - Get all offices
router.get('/',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const search = req.query.search || '';
      const wilayaId = req.query.wilayaId;

      // Build filter object
      const filter = {};
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { address: { $regex: search, $options: 'i' } }
        ];
      }
      if (wilayaId) {
        filter.wilayaId = wilayaId;
      }

      const offices = await Office.find(filter)
        .populate('wilayaId', 'name code')
        .populate('employers', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Office.countDocuments(filter);

      sendSuccess(res, 'Offices retrieved successfully', {
        offices,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      sendError(res, 'Failed to retrieve offices', error);
    }
  })
);

// GET /api/admin/offices/:id - Get single office by ID
router.get('/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const office = await Office.findById(req.params.id)
        .populate('wilayaId', 'name code')
        .populate('employers', 'name email');
      
      if (!office) {
        return sendError(res, 'Office not found', 404);
      }

      sendSuccess(res, 'Office retrieved successfully', { office });
    } catch (error) {
      sendError(res, 'Failed to retrieve office', error);
    }
  })
);

// PUT /api/admin/offices/:id - Update office
router.put('/:id',
  auth,
  adminOnly,
  updateOfficeValidation,
  asyncHandler(async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 'Validation failed', 400, errors.array());
      }

      const { name, address, phone, wilayaId } = req.body;
      const officeId = req.params.id;

      // Check if office exists
      const office = await Office.findById(officeId);
      if (!office) {
        return sendError(res, 'Office not found', 404);
      }

      // Check if wilaya exists (if provided)
      if (wilayaId) {
        const wilaya = await Wilaya.findById(wilayaId);
        if (!wilaya) {
          return sendError(res, 'Wilaya not found', 404);
        }
        office.wilayaId = wilayaId;
      }

      // Update office
      if (name) office.name = name;
      if (address) office.address = address;
      if (phone) office.phone = phone;

      await office.save();

      // Populate wilaya info for response
      await office.populate('wilayaId', 'name code');

      sendSuccess(res, 'Office updated successfully', { office });
    } catch (error) {
      sendError(res, 'Failed to update office', error);
    }
  })
);

// DELETE /api/admin/offices/:id - Delete office
router.delete('/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const officeId = req.params.id;

      // Check if office exists
      const office = await Office.findById(officeId);
      if (!office) {
        return sendError(res, 'Office not found', 404);
      }

      // Check if office has employers
      const employerCount = await User.countDocuments({ officeId, role: 'employer' });
      if (employerCount > 0) {
        return sendError(res, 'Cannot delete office with existing employers', 400);
      }

      await Office.findByIdAndDelete(officeId);

      sendSuccess(res, 'Office deleted successfully', { office });
    } catch (error) {
      sendError(res, 'Failed to delete office', error);
    }
  })
);

// GET /api/admin/offices/wilaya/:wilayaId - Get offices by wilaya
router.get('/wilaya/:wilayaId',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const { wilayaId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // Check if wilaya exists
      const wilaya = await Wilaya.findById(wilayaId);
      if (!wilaya) {
        return sendError(res, 'Wilaya not found', 404);
      }

      const offices = await Office.find({ wilayaId })
        .populate('employers', 'name email')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit);

      const total = await Office.countDocuments({ wilayaId });

      sendSuccess(res, 'Offices retrieved successfully', {
        offices,
        wilaya: { name: wilaya.name, code: wilaya.code },
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      sendError(res, 'Failed to retrieve offices', error);
    }
  })
);

module.exports = router;
