const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { adminOnly, employerOnly } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const Reservation = require('../models/reservation.model');
const Property = require('../models/property.model');
const User = require('../models/user.model');
const { body, validationResult } = require('express-validator');

// Validation rules for reservation creation
const createReservationValidation = [
  body('propertyId')
    .notEmpty().withMessage('Property ID is required')
    .isMongoId().withMessage('Invalid Property ID'),
  body('customerName')
    .notEmpty().withMessage('Customer name is required')
    .isLength({ max: 100 }).withMessage('Customer name cannot exceed 100 characters')
    .trim(),
  body('customerPhone')
    .notEmpty().withMessage('Customer phone is required')
    .isLength({ max: 20 }).withMessage('Customer phone cannot exceed 20 characters')
    .trim(),
  body('startDate')
    .notEmpty().withMessage('Start date is required')
    .isISO8601().withMessage('Invalid start date format'),
  body('endDate')
    .notEmpty().withMessage('End date is required')
    .isISO8601().withMessage('Invalid end date format'),
  body('totalPrice')
    .notEmpty().withMessage('Total price is required')
    .isNumeric().withMessage('Total price must be a number')
    .isFloat({ min: 0 }).withMessage('Total price cannot be negative'),
  body('status')
    .optional()
    .isIn(['pending', 'approved', 'cancelled']).withMessage('Invalid status')
];

// Validation rules for reservation update
const updateReservationValidation = [
  body('customerName')
    .optional()
    .isLength({ max: 100 }).withMessage('Customer name cannot exceed 100 characters')
    .trim(),
  body('customerPhone')
    .optional()
    .isLength({ max: 20 }).withMessage('Customer phone cannot exceed 20 characters')
    .trim(),
  body('startDate')
    .optional()
    .isISO8601().withMessage('Invalid start date format'),
  body('endDate')
    .optional()
    .isISO8601().withMessage('Invalid end date format'),
  body('totalPrice')
    .optional()
    .isNumeric().withMessage('Total price must be a number')
    .isFloat({ min: 0 }).withMessage('Total price cannot be negative'),
  body('status')
    .optional()
    .isIn(['pending', 'approved', 'cancelled']).withMessage('Invalid status')
];

// POST /api/admin/reservations - Create new reservation
router.post('/',
  auth,
  employerOnly,
  createReservationValidation,
  asyncHandler(async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 'Validation failed', 400, errors.array());
      }

      const { propertyId, customerName, customerPhone, startDate, endDate, totalPrice, status } = req.body;

      // Check if property exists and is available
      const property = await Property.findById(propertyId);
      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      if (!property.available) {
        return sendError(res, 'Property is not available for reservation', 400);
      }

      // Create reservation
      const reservation = new Reservation({
        propertyId,
        customerName,
        customerPhone,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice,
        status: status || 'pending'
      });

      await reservation.save();

      sendSuccess(res, 'Reservation created successfully', { reservation }, 201);
    } catch (error) {
      sendError(res, 'Failed to create reservation', error);
    }
  })
);

// GET /api/admin/reservations - Get all reservations
router.get('/',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const search = req.query.search || '';

      // Build filter object
      const filter = {};
      if (search) {
        filter.$or = [
          { customerName: { $regex: search, $options: 'i' } },
          { customerPhone: { $regex: search, $options: 'i' } }
        ];
      }

      const reservations = await Reservation.find(filter)
        .populate('propertyId', 'title description pricePerDay wilayaId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Reservation.countDocuments(filter);

      sendSuccess(res, 'Reservations retrieved successfully', {
        reservations,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      sendError(res, 'Failed to retrieve reservations', error);
    }
  })
);

// GET /api/admin/reservations/:id - Get single reservation by ID
router.get('/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const reservation = await Reservation.findById(req.params.id)
        .populate('propertyId', 'title description pricePerDay wilayaId');

      if (!reservation) {
        return sendError(res, 'Reservation not found', 404);
      }

      sendSuccess(res, 'Reservation retrieved successfully', { reservation });
    } catch (error) {
      sendError(res, 'Failed to retrieve reservation', error);
    }
  })
);

// PUT /api/admin/reservations/:id - Update reservation
router.put('/:id',
  auth,
  adminOnly,
  updateReservationValidation,
  asyncHandler(async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 'Validation failed', 400, errors.array());
      }

      const { customerName, customerPhone, startDate, endDate, totalPrice, status } = req.body;
      const reservationId = req.params.id;

      // Check if reservation exists
      const reservation = await Reservation.findById(reservationId);
      if (!reservation) {
        return sendError(res, 'Reservation not found', 404);
      }

      // Update reservation
      if (customerName) reservation.customerName = customerName;
      if (customerPhone) reservation.customerPhone = customerPhone;
      if (startDate) reservation.startDate = new Date(startDate);
      if (endDate) reservation.endDate = new Date(endDate);
      if (totalPrice) reservation.totalPrice = totalPrice;
      if (status) reservation.status = status;

      await reservation.save();

      sendSuccess(res, 'Reservation updated successfully', { reservation });
    } catch (error) {
      sendError(res, 'Failed to update reservation', error);
    }
  })
);

// DELETE /api/admin/reservations/:id - Delete reservation
router.delete('/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const reservationId = req.params.id;

      // Check if reservation exists
      const reservation = await Reservation.findById(reservationId);
      if (!reservation) {
        return sendError(res, 'Reservation not found', 404);
      }

      await Reservation.findByIdAndDelete(reservationId);

      sendSuccess(res, 'Reservation deleted successfully', { reservation });
    } catch (error) {
      sendError(res, 'Failed to delete reservation', error);
    }
  })
);

// GET /api/admin/reservations/property/:propertyId - Get reservations by property
router.get('/property/:propertyId',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const { propertyId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const reservations = await Reservation.find({ propertyId })
        .populate('propertyId', 'title description pricePerDay wilayaId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Reservation.countDocuments({ propertyId });

      sendSuccess(res, 'Reservations retrieved successfully', {
        reservations,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      sendError(res, 'Failed to retrieve reservations', error);
    }
  })
);

// GET /api/admin/reservations/employer/:employerId - Get reservations by employer
router.get('/employer/:employerId',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const { employerId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const reservations = await Reservation.find({ employerId })
        .populate('propertyId', 'title description pricePerDay wilayaId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Reservation.countDocuments({ employerId });

      sendSuccess(res, 'Reservations retrieved successfully', {
        reservations,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      sendError(res, 'Failed to retrieve reservations', error);
    }
  })
);

module.exports = router;
