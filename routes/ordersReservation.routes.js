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
const Notification = require('../models/notification.model');
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
    .custom((value) => {
      // Allow blob URLs, regular URLs, or base64 strings
      if (!value) return true;
      const isBlobUrl = value.startsWith('blob:');
      const isRegularUrl = /^https?:\/\/.+/.test(value);
      const isBase64 = value.startsWith('data:image/');
      if (!isBlobUrl && !isRegularUrl && !isBase64) {
        throw new Error('Each identity image must be a valid URL (http, https, blob) or base64 image');
      }
      return true;
    })
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

    // Execute query with pagination and populate property with isReserved field
    const orders = await OrdersReservation.find(filter)
      .populate('propertyId', 'title location pricePerDay images isReserved')
      .populate('wilayaId', 'name')
      .populate('employerNotes.employerId', 'firstName lastName username')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Check and update orderType based on property isReserved status
    const updatedOrders = await Promise.all(orders.map(async (order) => {
      if (order.propertyId && order.propertyId.isReserved !== undefined) {
        const expectedOrderType = order.propertyId.isReserved ? 'reserver_property' : 'notreserver_property';
        
        // Update order if orderType doesn't match property isReserved status
        if (order.orderType !== expectedOrderType) {
          order.orderType = expectedOrderType;
          await order.save();
        }
      }
      return order;
    }));

    const total = await OrdersReservation.countDocuments(filter);

    sendSuccess(res, 'Orders retrieved successfully', {
      orders: updatedOrders,
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

// GET /api/admin/orders-reservation/employer - Get orders for employer
router.get('/employer', auth, employerOnly, asyncHandler(async (req, res) => {
  try {
    console.log('🟢 Employer orders request - User:', req.user);
    console.log('🟢 User officeId:', req.user.officeId);
    
    const { page = 1, limit = 50, status, orderType, priority } = req.query;
    
    // Get employer's office and wilaya
    const Office = require('../models/office.model');
    const employerOffice = await Office.findById(req.user.officeId);
    
    console.log('🟢 Employer office found:', employerOffice);
    
    if (!employerOffice) {
      console.error('🔴 Employer office not found for officeId:', req.user.officeId);
      return sendError(res, 'Employer office not found', 404);
    }

    console.log('🟢 Employer wilayaId:', employerOffice.wilayaId);

    // Build filter - show orders from employer's wilaya (same as properties filter)
    const filter = { wilayaId: employerOffice.wilayaId };
    if (status) filter.status = status;
    if (orderType) filter.orderType = orderType;
    if (priority) filter.priority = priority;

    console.log('🟢 Filter:', filter);

    // Execute query with pagination and populate property with isReserved field
    // Use lean() to avoid Mongoose validation on existing documents
    const orders = await OrdersReservation.find(filter)
      .populate('propertyId', 'title location pricePerDay images isReserved')
      .populate('wilayaId', 'name')
      .populate('employerNotes.employerId', 'firstName lastName username')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean(); // Use lean() to avoid validation

    console.log('🟢 Raw orders found:', orders.length);

    // Check and update orderType based on property isReserved status
    // Also add default values for missing fields
    const updatedOrders = await Promise.all(orders.map(async (order) => {
      // Add default values for missing fields (backward compatibility)
      if (order.totalPrice === undefined) order.totalPrice = 0;
      if (order.isMarried === undefined) order.isMarried = false;
      if (order.numberOfPeople === undefined) order.numberOfPeople = 1;
      if (order.identityImages === undefined) order.identityImages = [];
      
      if (order.propertyId && order.propertyId.isReserved !== undefined) {
        const expectedOrderType = order.propertyId.isReserved ? 'reserver_property' : 'notreserver_property';
        
        // Update order if orderType doesn't match property isReserved status
        if (order.orderType !== expectedOrderType) {
          // Use findOneAndUpdate to avoid validation issues
          await OrdersReservation.findOneAndUpdate(
            { _id: order._id },
            { orderType: expectedOrderType }
          );
          order.orderType = expectedOrderType;
        }
      }
      return order;
    }));

    const total = await OrdersReservation.countDocuments(filter);

    console.log('🟢 Found orders:', updatedOrders.length);
    console.log('🟢 Total orders:', total);

    sendSuccess(res, 'Orders retrieved successfully', {
      data: updatedOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('🔴 Get employer orders error:', error);
    console.error('🔴 Error stack:', error.stack);
    sendError(res, 'Failed to retrieve orders', 500);
  }
}));

// GET /api/admin/orders-reservation/:id - Get single order by ID
router.get('/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  try {
    const order = await OrdersReservation.findById(req.params.id)
      .populate('propertyId', 'title location pricePerDay images isReserved')
      .populate('wilayaId', 'name');

    if (!order) {
      return sendError(res, 'Order not found', 404);
    }

    // Check and update orderType based on property isReserved status
    if (order.propertyId && order.propertyId.isReserved !== undefined) {
      const expectedOrderType = order.propertyId.isReserved ? 'reserver_property' : 'notreserver_property';
      
      // Update order if orderType doesn't match property isReserved status
      if (order.orderType !== expectedOrderType) {
        order.orderType = expectedOrderType;
        await order.save();
      }
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
      notes,
      // New fields from multi-step modal
      isMarried,
      numberOfPeople,
      totalPrice,
      identityImages = []
    } = req.body;

    // Validate that property exists
    const property = await Property.findById(propertyId);
    if (!property) {
      return sendError(res, 'Property not found', 404);
    }

    // Additional validation for targetAudience and capacity
    if (property.targetAudience === 'family' && !isMarried) {
      return sendError(res, 'هذا العقار مخصص للعائلات فقط. يرجى اختيار "متزوج" للمتابعة.', 400);
    }
    
    if (property.targetAudience === 'normal' && isMarried) {
      return sendError(res, 'هذا العقار مخصص للأفراد فقط. يرجى اختيار "أعزب" للمتابعة.', 400);
    }
    
    // Check if number of people exceeds property capacity
    if (property.capacity && numberOfPeople > property.capacity) {
      return sendError(res, `سعة هذا العقار لا تتجاوز ${property.capacity} أشخاص. يرجى تقليل عدد الأشخاص.`, 400);
    }
    
    // Additional validation for family properties
    if (property.targetAudience === 'family' && numberOfPeople < 2) {
      return sendError(res, 'العقارات العائلية تتطلب شخصين على الأقل.', 400);
    }

    // Validate maximum number of identity images
    const maxImages = 4;
    if (identityImages && identityImages.length > maxImages) {
      return sendError(res, `لا يمكن رفع أكثر من ${maxImages} صور للهوية.`, 400);
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
      notes,
      // Include new fields from multi-step modal
      isMarried,
      numberOfPeople,
      totalPrice,
      identityImages
    });

    await order.save();

    // Create notification for new order
    try {
      await Notification.create({
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
      });
    } catch (notificationError) {
      console.error('Failed to create notification:', notificationError);
      // Continue with order creation even if notification fails
    }

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

    // Allow status change from any status to approved
    const previousStatus = order.status;
    order.status = 'approved';
    if (adminNotes) order.adminNotes = adminNotes;
    await order.save();

    // Populate references for response
    await order.populate('propertyId', 'title location pricePerDay images');
    await order.populate('wilayaId', 'name');

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

    // Allow status change from any status to rejected
    const previousStatus = order.status;
    order.status = 'rejected';
    if (adminNotes) order.adminNotes = adminNotes;
    await order.save();

    // Populate references for response
    await order.populate('propertyId', 'title location pricePerDay images');
    await order.populate('wilayaId', 'name');

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

    sendSuccess(res, 'Order updated successfully', { order });
  } catch (error) {
    console.error('Update order error:', error);
    sendError(res, 'Failed to update order', 500);
  }
}));

// POST /api/admin/orders-reservation/:id/employer-notes - Add employer note
router.post('/:id/employer-notes', auth, employerOnly, [
  body('message')
    .notEmpty().withMessage('Note message is required')
    .isLength({ max: 500 }).withMessage('Note cannot exceed 500 characters')
    .trim()
], asyncHandler(async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation failed', 400, errors.array());
    }

    const { message } = req.body;

    const order = await OrdersReservation.findById(req.params.id);
    if (!order) {
      return sendError(res, 'Order not found', 404);
    }

    // Add employer note
    await order.addEmployerNote(req.user._id, message);

    // Populate references first to get property and wilaya data for notification
    await order.populate('propertyId', 'title location pricePerDay images');
    await order.populate('wilayaId', 'name');
    await order.populate('employerNotes.employerId', 'firstName lastName');

    // Create notification for employer note
    await Notification.create({
      type: 'order',
      title: 'ملاحظة موظف جديدة',
      message: `${req.user.firstName || 'موظف'} أضاف ملاحظة "${message}" على الطلب #${order._id} للعقار "${order.propertyId?.title || 'عقار غير محدد'}" في ولاية "${order.wilayaId?.name || 'ولاية غير محددة'}"`,
      orderId: order._id,
      propertyId: order.propertyId,
      userId: req.user._id,
      metadata: {
        noteType: 'employerNote',
        employerName: req.user.firstName || 'موظف',
        noteMessage: message,
        customerName: order.fullname || order.customerName || 'عميل غير محدد',
        propertyTitle: order.propertyId?.title || 'عقار غير محدد',
        wilayaName: order.wilayaId?.name || 'ولاية غير محددة'
      }
    });

    sendSuccess(res, 'Employer note added successfully', { order });
  } catch (error) {
    console.error('Add employer note error:', error);
    sendError(res, 'Failed to add employer note', 500);
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

    sendSuccess(res, null, 'Order deleted successfully');
  } catch (error) {
    console.error('Delete order error:', error);
    sendError(res, 'Failed to delete order', 500);
  }
}));

module.exports = router;
