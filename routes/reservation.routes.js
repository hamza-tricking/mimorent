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

      // Check if property is available for the requested dates
      const isAvailable = await Reservation.checkAvailability(
        propertyId, 
        new Date(startDate), 
        new Date(endDate)
      );

      if (!isAvailable) {
        return sendError(res, 'Property is not available for the requested dates', 409);
      }

      const reservation = new Reservation({ 
        propertyId, 
        employerId: req.user._id, // Get employer ID from authenticated user
        customerName, 
        customerPhone, 
        startDate: new Date(startDate), 
        endDate: new Date(endDate), 
        totalPrice,
        status: status || 'pending'
      });
      
      await reservation.save();

      // Populate related data for response
      await reservation.populate([
        { path: 'propertyId', select: 'title pricePerDay wilayaId' },
        { path: 'employerId', select: 'name email' }
      ]);

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
      const status = req.query.status;
      const propertyId = req.query.propertyId;
      const employerId = req.query.employerId;

      // Build filter object
      const filter = {};
      if (search) {
        filter.$or = [
          { customerName: { $regex: search, $options: 'i' } },
          { customerPhone: { $regex: search, $options: 'i' } }
        ];
      }
      if (status) {
        filter.status = status;
      }
      if (propertyId) {
        filter.propertyId = propertyId;
      }
      if (employerId) {
        filter.employerId = employerId;
      }

      const reservations = await Reservation.find(filter)
        .populate('propertyId', 'title pricePerDay')
        .populate('employerId', 'name email')
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
        .populate('propertyId', 'title description pricePerDay wilayaId')
        .populate('employerId', 'name email');
      
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

      // If dates are changing, check availability
      if (startDate || endDate) {
        const newStartDate = startDate ? new Date(startDate) : reservation.startDate;
        const newEndDate = endDate ? new Date(endDate) : reservation.endDate;
        
        const isAvailable = await Reservation.checkAvailability(
          reservation.propertyId,
          newStartDate,
          newEndDate,
          reservationId
        );

        if (!isAvailable) {
          return sendError(res, 'Property is not available for the requested dates', 409);
        }

        reservation.startDate = newStartDate;
        reservation.endDate = newEndDate;
      }

      // Update reservation
      if (customerName) reservation.customerName = customerName;
      if (customerPhone) reservation.customerPhone = customerPhone;
      if (totalPrice) reservation.totalPrice = totalPrice;
      if (status) reservation.status = status;

      await reservation.save();

      // Populate related data for response
      await reservation.populate([
        { path: 'propertyId', select: 'title pricePerDay' },
        { path: 'employerId', select: 'name email' }
      ]);

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
      const status = req.query.status;

      // Check if property exists
      const property = await Property.findById(propertyId);
      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      // Build filter object
      const filter = { propertyId };
      if (status) {
        filter.status = status;
      }

      const reservations = await Reservation.find(filter)
        .populate('employerId', 'name email')
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Reservation.countDocuments(filter);

      sendSuccess(res, 'Reservations retrieved successfully', {
        reservations,
        property: { title: property.title, pricePerDay: property.pricePerDay },
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
      const status = req.query.status;

      // Check if employer exists
      const employer = await User.findById(employerId);
      if (!employer) {
        return sendError(res, 'Employer not found', 404);
      }

      // Build filter object
      const filter = { employerId };
      if (status) {
        filter.status = status;
      }

      const reservations = await Reservation.find(filter)
        .populate('propertyId', 'title pricePerDay')
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Reservation.countDocuments(filter);

      sendSuccess(res, 'Reservations retrieved successfully', {
        reservations,
        employer: { name: employer.name, email: employer.email },
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
