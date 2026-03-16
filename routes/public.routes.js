const express = require('express');
const router = express.Router();
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const Property = require('../models/property.model');
const Wilaya = require('../models/wilaya.model');
const Reservation = require('../models/reservation.model');
const OrdersReservation = require('../models/ordersReservation.model');
const Notification = require('../models/notification.model');
const Office = require('../models/office.model');
console.log('🔔 Notification model loaded in public.routes.js');
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
    .trim(),
  // New validation rules for multi-step modal fields
  body('isMarried')
    .notEmpty().withMessage('Marital status is required')
    .isBoolean().withMessage('Marital status must be boolean'),
  body('numberOfPeople')
    .notEmpty().withMessage('Number of people is required')
    .isInt({ min: 1 }).withMessage('Number of people must be at least 1'),
  body('totalPrice')
    .notEmpty().withMessage('Total price is required')
    .isNumeric().withMessage('Total price must be a number')
    .isFloat({ min: 0 }).withMessage('Total price must be at least 0'),
  body('identityImages')
    .optional()
    .isArray().withMessage('Identity images must be an array'),
  body('identityImages.*')
    .optional()
    .isURL().withMessage('Each identity image must be a valid URL')
];

// POST /api/orders-reservation - Create new order (public endpoint)
router.post('/orders-reservation', createOrderValidation, asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Order creation request received:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('🔴 Validation errors:', errors.array());
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
      notes,
      // New fields from multi-step modal
      isMarried,
      numberOfPeople,
      totalPrice,
      identityImages = []
    } = req.body;

    console.log('🔍 Parsed order data:', {
      fullname,
      phoneNumber,
      propertyId,
      wilayaId,
      startDate,
      endDate,
      orderType,
      priority,
      notes
    });

    // Validate that property exists
    const property = await Property.findById(propertyId);
    if (!property) {
      console.log('🔴 Property not found:', propertyId);
      return sendError(res, 'Property not found', 404);
    }

    // Validate that wilaya exists
    const wilaya = await Wilaya.findById(wilayaId);
    if (!wilaya) {
      console.log('🔴 Wilaya not found:', wilayaId);
      return sendError(res, 'Wilaya not found', 404);
    }

    console.log('✅ Property and Wilaya validated');

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
      notes,
      // Include new fields from multi-step modal
      isMarried,
      numberOfPeople,
      totalPrice,
      identityImages
    });

    console.log('🔍 Created order object:', order);

    await order.save();
    console.log('✅ Order saved to database, attempting to create notification...');

    // Create notification for new order
    try {
      console.log('Creating notification for order:', order._id);
      console.log('Notification model available:', !!Notification);
      
      const notificationData = {
        type: 'order',
        title: 'طلب حجز جديد',
        message: `طلب حجز جديد من ${fullname} للعقار ${property.title}`,
        orderId: order._id,
        propertyId: propertyId,
        metadata: {
          customerName: fullname,
          propertyTitle: property.title,
          phoneNumber: phoneNumber
        }
      };
      console.log('Notification data:', notificationData);
      
      await Notification.create(notificationData);
      console.log('✅ Notification created successfully');
    } catch (notificationError) {
      console.error('❌ Failed to create notification:', notificationError);
      console.error('❌ Error stack:', notificationError.stack);
      // Continue with order creation even if notification fails
    }

    // Populate references for response
    await order.populate('propertyId', 'title location pricePerDay images');
    await order.populate('wilayaId', 'name');

    console.log('✅ Order populated with references');

    sendSuccess(res, 'Order created successfully', { order }, 201);
    console.log('✅ Order creation response sent');
  } catch (error) {
    console.error('🔴 Create order error:', error);
    if (error.name === 'ValidationError') {
      console.log('🔴 Mongoose validation error:', error.message);
      return sendError(res, error.message, 400);
    }
    console.log('🔴 General error:', error);
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
        .populate('reservationIds', 'endDate')
        .sort({ createdAt: -1 });

      console.log('Available properties found:', properties.length);

      // Add availability information to each property
      const propertiesWithReservationInfo = properties.map(property => {
        const propertyObj = property.toObject();
        
        // Use the property's isReserved field directly (more reliable)
        // Also check for active reservations as backup
        const isCurrentlyReserved = propertyObj.isReserved === true;
        
        // If property is marked as reserved, try to get the earliest reservation end date
        if (isCurrentlyReserved && property.reservationIds && property.reservationIds.length > 0) {
          // Get the earliest end date from all reservations
          const activeReservations = property.reservationIds.filter(reservation => 
            reservation && reservation.endDate && new Date(reservation.endDate) > new Date()
          );
          
          if (activeReservations.length > 0) {
            const earliestEndDate = activeReservations.reduce((earliest, current) => 
              new Date(current.endDate) < new Date(earliest.endDate) ? current : earliest
            );
            propertyObj.reservationEndDate = earliestEndDate.endDate;
          } else {
            propertyObj.reservationEndDate = null;
          }
        } else {
          propertyObj.reservationEndDate = null;
        }
        
        // Override isReserved with the actual field value
        propertyObj.isReserved = isCurrentlyReserved;
        
        return propertyObj;
      });

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

// GET /api/offices - Get all offices (public)
router.get('/offices',
  asyncHandler(async (req, res) => {
    try {
      const offices = await Office.find()
        .populate('wilayaId', 'name')
        .sort({ name: 1 });

      sendSuccess(res, 'Offices retrieved successfully', { offices });
    } catch (error) {
      console.error('Get offices error:', error);
      sendError(res, 'Failed to retrieve offices', 500, error.message);
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
