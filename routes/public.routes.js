const express = require('express');
const router = express.Router();
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const Property = require('../models/property.model');
const Wilaya = require('../models/wilaya.model');
const Reservation = require('../models/reservation.model');
const OrdersReservation = require('../models/ordersReservation.model');
const { body, validationResult } = require('express-validator');

// Validation rules for order creation
const createOrderValidation = [
  body('fullname')
    .notEmpty().withMessage('Full name is required')
    .isLength({ max: 100 }).withMessage('Full name cannot exceed 100 characters')
    .trim(),
  body('phoneNumber')
    .notEmpty().withMessage('Phone number is required')
    .isLength({ max: 20 }).withMessage('Phone number cannot exceed 20 characters')
    .trim(),
  body('propertyId')
    .notEmpty().withMessage('Property ID is required')
    .isMongoId().withMessage('Invalid Property ID'),
  body('wilayaId')
    .notEmpty().withMessage('Wilaya ID is required')
    .isMongoId().withMessage('Invalid Wilaya ID'),
  body('startDate')
    .notEmpty().withMessage('Start date is required')
    .isISO8601().withMessage('Invalid start date format'),
  body('endDate')
    .notEmpty().withMessage('End date is required')
    .isISO8601().withMessage('Invalid end date format'),
  body('orderType')
    .optional()
    .isIn(['reserver_property', 'notreserver_property']).withMessage('Invalid order type'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high']).withMessage('Invalid priority level'),
  body('notes')
    .optional()
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
    .trim()
];

// POST /api/orders-reservation - Create new order (public endpoint)
router.post('/orders-reservation', createOrderValidation, asyncHandler(async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation failed', 400, errors.array());
    }

    const {
      fullname,
      phoneNumber,
      propertyId,
      wilayaId,
      startDate,
      endDate,
      orderType = 'notreserver_property',
      priority = 'medium',
      notes
    } = req.body;

    // Validate that property exists
    const property = await Property.findById(propertyId);
    if (!property) {
      return sendError(res, 'Property not found', 404);
    }

    // Validate that wilaya exists
    const wilaya = await Wilaya.findById(wilayaId);
    if (!wilaya) {
      return sendError(res, 'Wilaya not found', 404);
    }

    // Create order
    const order = new OrdersReservation({
      fullname,
      phoneNumber,
      propertyId,
      wilayaId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      orderType,
      priority,
      notes
    });

    await order.save();

    // Populate references for response
    await order.populate('propertyId', 'title location pricePerDay images');
    await order.populate('wilayaId', 'name');

    sendSuccess(res, 'Order created successfully', { order }, 201);
  } catch (error) {
    console.error('Create order error:', error);
    if (error.name === 'ValidationError') {
      return sendError(res, error.message, 400);
    }
    sendError(res, 'Failed to create order', 500);
  }
}));

// GET /api/properties - Get all available properties (public)
router.get('/properties',
  asyncHandler(async (req, res) => {
    try {
      console.log('Public properties API called');

      // Get available properties (available: true, regardless of isReserved)
      const properties = await Property.find({ available: true })
        .populate('wilayaId', 'name')
        .populate('officeId', 'name')
        .sort({ createdAt: -1 });

      console.log('Available properties found:', properties.length);

      // Add reservation end date for reserved properties
      const propertiesWithReservationInfo = await Promise.all(
        properties.map(async (property) => {
          const propertyObj = property.toObject();
          
          // Check if property has active reservations (don't rely on isReserved field)
          const activeReservation = await Reservation.findOne({
            propertyId: property._id,
            status: { $in: ['pending', 'confirmed', 'approved'] }
          }).sort({ endDate: -1 }).select('endDate');
          
          if (activeReservation) {
            propertyObj.isReserved = true;
            propertyObj.reservationEndDate = activeReservation.endDate;
          } else {
            propertyObj.isReserved = false;
          }
          
          return propertyObj;
        })
      );

      sendSuccess(res, 'Properties retrieved successfully', {
        properties: propertiesWithReservationInfo
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
