const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { adminOnly, employerOnly } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const OrdersReservation = require('../models/ordersReservation.model');
const Property = require('../models/property.model');
const Wilaya = require('../models/wilaya.model');
const History = require('../models/history.model');
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

// Validation rules for order action (approve/reject)
const orderActionValidation = [
  body('adminNotes')
    .optional()
    .isLength({ max: 500 }).withMessage('Admin notes cannot exceed 500 characters')
    .trim()
];

// GET /api/admin/orders-reservation - Get all orders
router.get('/', auth, adminOnly, asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 50, status, orderType, wilayaId, priority } = req.query;
    
    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (orderType) filter.orderType = orderType;
    if (wilayaId) filter.wilayaId = wilayaId;
    if (priority) filter.priority = priority;

    // Execute query with pagination
    const orders = await OrdersReservation.find(filter)
      .populate('propertyId', 'title location pricePerDay images')
      .populate('wilayaId', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await OrdersReservation.countDocuments(filter);

    sendSuccess(res, 'Orders retrieved successfully', {
      orders,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    sendError(res, 'Failed to retrieve orders', 500);
  }
}));

// GET /api/admin/orders-reservation/:id - Get single order by ID
router.get('/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  try {
    const order = await OrdersReservation.findById(req.params.id)
      .populate('propertyId', 'title location pricePerDay images')
      .populate('wilayaId', 'name');

    if (!order) {
      return sendError(res, 'Order not found', 404);
    }

    sendSuccess(res, 'Order retrieved successfully', { order });
  } catch (error) {
    console.error('Get order error:', error);
    sendError(res, 'Failed to retrieve order', 500);
  }
}));

// POST /api/admin/orders-reservation - Create new order
router.post('/', auth, adminOnly, createOrderValidation, asyncHandler(async (req, res) => {
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

    // Create history entry
    try {
      const History = require('../models/history.model');
      await History.create({
        action: 'create_order',
        targetId: order._id,
        targetModel: 'OrdersReservation',
        details: `Created order for ${fullname} - Property: ${property.title}`,
        userId: req.user.id
      });
    } catch (historyError) {
      console.error('Failed to create history entry:', historyError);
    }

    sendSuccess(res, 'Order created successfully', { order }, 201);
  } catch (error) {
    console.error('Create order error:', error);
    if (error.name === 'ValidationError') {
      return sendError(res, error.message, 400);
    }
    sendError(res, 'Failed to create order', 500);
  }
}));

// PUT /api/admin/orders-reservation/:id/approve - Approve order
router.put('/:id/approve', auth, adminOnly, orderActionValidation, asyncHandler(async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation failed', 400, errors.array());
    }

    const { adminNotes } = req.body;

    const order = await OrdersReservation.findById(req.params.id);
    if (!order) {
      return sendError(res, 'Order not found', 404);
    }

    if (order.status !== 'pending') {
      return sendError(res, 'Only pending orders can be approved', 400);
    }

    // Update order status
    order.status = 'approved';
    if (adminNotes) order.adminNotes = adminNotes;
    await order.save();

    // Populate references for response
    await order.populate('propertyId', 'title location pricePerDay images');
    await order.populate('wilayaId', 'name');

    // Create history entry
    try {
      const History = require('../models/history.model');
      await History.create({
        action: 'approve_order',
        targetId: order._id,
        targetModel: 'OrdersReservation',
        details: `Approved order for ${order.fullname} - Property: ${order.propertyId.title}`,
        userId: req.user.id
      });
    } catch (historyError) {
      console.error('Failed to create history entry:', historyError);
    }

    sendSuccess(res, 'Order approved successfully', { order });
  } catch (error) {
    console.error('Approve order error:', error);
    sendError(res, 'Failed to approve order', 500);
  }
}));

// PUT /api/admin/orders-reservation/:id/reject - Reject order
router.put('/:id/reject', auth, adminOnly, orderActionValidation, asyncHandler(async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation failed', 400, errors.array());
    }

    const { adminNotes } = req.body;

    const order = await OrdersReservation.findById(req.params.id);
    if (!order) {
      return sendError(res, 'Order not found', 404);
    }

    if (order.status !== 'pending') {
      return sendError(res, 'Only pending orders can be rejected', 400);
    }

    // Update order status
    order.status = 'rejected';
    if (adminNotes) order.adminNotes = adminNotes;
    await order.save();

    // Populate references for response
    await order.populate('propertyId', 'title location pricePerDay images');
    await order.populate('wilayaId', 'name');

    // Create history entry
    try {
      const History = require('../models/history.model');
      await History.create({
        action: 'reject_order',
        targetId: order._id,
        targetModel: 'OrdersReservation',
        details: `Rejected order for ${order.fullname} - Property: ${order.propertyId.title}`,
        userId: req.user.id
      });
    } catch (historyError) {
      console.error('Failed to create history entry:', historyError);
    }

    sendSuccess(res, 'Order rejected successfully', { order });
  } catch (error) {
    console.error('Reject order error:', error);
    sendError(res, 'Failed to reject order', 500);
  }
}));

// PUT /api/admin/orders-reservation/:id/process - Process order (mark as processing)
router.put('/:id/process', auth, adminOnly, asyncHandler(async (req, res) => {
  try {
    const order = await OrdersReservation.findById(req.params.id);
    if (!order) {
      return sendError(res, 'Order not found', 404);
    }

    if (order.status !== 'pending') {
      return sendError(res, 'Only pending orders can be processed', 400);
    }

    // Update order status
    order.status = 'processing';
    await order.save();

    // Populate references for response
    await order.populate('propertyId', 'title location pricePerDay images');
    await order.populate('wilayaId', 'name');

    // Create history entry
    try {
      const History = require('../models/history.model');
      await History.create({
        action: 'process_order',
        targetId: order._id,
        targetModel: 'OrdersReservation',
        details: `Started processing order for ${order.fullname} - Property: ${order.propertyId.title}`,
        userId: req.user.id
      });
    } catch (historyError) {
      console.error('Failed to create history entry:', historyError);
    }

    sendSuccess(res, 'Order marked as processing successfully', { order });
  } catch (error) {
    console.error('Process order error:', error);
    sendError(res, 'Failed to process order', 500);
  }
}));

// PUT /api/admin/orders-reservation/:id - Update order priority and admin notes
router.put('/:id', auth, adminOnly, orderActionValidation, asyncHandler(async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation failed', 400, errors.array());
    }

    const { priority, adminNotes } = req.body;

    const order = await OrdersReservation.findById(req.params.id);
    if (!order) {
      return sendError(res, 'Order not found', 404);
    }

    // Update fields
    if (priority) order.priority = priority;
    if (adminNotes !== undefined) order.adminNotes = adminNotes;

    await order.save();

    // Populate references for response
    await order.populate('propertyId', 'title location pricePerDay images');
    await order.populate('wilayaId', 'name');

    // Create history entry
    try {
      const History = require('../models/history.model');
      await History.create({
        action: 'update_order',
        targetId: order._id,
        targetModel: 'OrdersReservation',
        details: `Updated order for ${order.fullname} - Priority: ${priority}, Admin Notes: ${adminNotes || 'None'}`,
        userId: req.user.id
      });
    } catch (historyError) {
      console.error('Failed to create history entry:', historyError);
    }

    sendSuccess(res, 'Order updated successfully', { order });
  } catch (error) {
    console.error('Update order error:', error);
    sendError(res, 'Failed to update order', 500);
  }
}));

// DELETE /api/admin/orders-reservation/:id - Delete order
router.delete('/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  try {
    const order = await OrdersReservation.findById(req.params.id);
    if (!order) {
      return sendError(res, 'Order not found', 404);
    }

    await OrdersReservation.findByIdAndDelete(req.params.id);

    // Create history entry
    try {
      const History = require('../models/history.model');
      await History.create({
        action: 'delete_order',
        targetId: order._id,
        targetModel: 'OrdersReservation',
        details: `Deleted order for ${order.fullname} - Property: ${order.propertyId.title}`,
        userId: req.user.id
      });
    } catch (historyError) {
      console.error('Failed to create history entry:', historyError);
    }

    sendSuccess(res, null, 'Order deleted successfully');
  } catch (error) {
    console.error('Delete order error:', error);
    sendError(res, 'Failed to delete order', 500);
  }
}));

module.exports = router;
