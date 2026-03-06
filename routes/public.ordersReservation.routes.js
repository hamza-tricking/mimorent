const express = require('express');
const router = express.Router();
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const OrdersReservation = require('../models/ordersReservation.model');
const Property = require('../models/property.model');
const Wilaya = require('../models/wilaya.model');
const Notification = require('../models/notification.model');
console.log('🔔 Notification model loaded in public route');
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
router.post('/', createOrderValidation, asyncHandler(async (req, res) => {
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

    sendSuccess(res, { order }, 'Order created successfully', 201);
  } catch (error) {
    console.error('Create order error:', error);
    if (error.name === 'ValidationError') {
      return sendError(res, error.message, 400);
    }
    sendError(res, 'Failed to create order', 500);
  }
}));

module.exports = router;
