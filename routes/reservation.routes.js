const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { adminOnly, employerOnly } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const Reservation = require('../models/reservation.model');
const Property = require('../models/property.model');
const User = require('../models/user.model');
const History = require('../models/history.model');
const Notification = require('../models/notification.model');
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
  body('paidAmount')
    .notEmpty().withMessage('Paid amount is required')
    .isNumeric().withMessage('Paid amount must be a number')
    .isFloat({ min: 0 }).withMessage('Paid amount cannot be negative'),
  body('remainingAmount')
    .notEmpty().withMessage('Remaining amount is required')
    .isNumeric().withMessage('Remaining amount must be a number')
    .isFloat({ min: 0 }).withMessage('Remaining amount cannot be negative'),
  body('paymentStatus')
    .optional()
    .isIn(['pending', 'partial', 'paid']).withMessage('Invalid payment status'),
  body('status')
    .optional()
    .isIn(['pending', 'confirmed', 'cancelled', 'completed']).withMessage('Invalid status')
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
  body('paidAmount')
    .optional()
    .isNumeric().withMessage('Paid amount must be a number')
    .isFloat({ min: 0 }).withMessage('Paid amount cannot be negative'),
  body('remainingAmount')
    .optional()
    .isNumeric().withMessage('Remaining amount must be a number')
    .isFloat({ min: 0 }).withMessage('Remaining amount cannot be negative'),
  body('paymentStatus')
    .optional()
    .isIn(['pending', 'partial', 'paid']).withMessage('Invalid payment status'),
  body('status')
    .optional()
    .isIn(['pending', 'confirmed', 'cancelled', 'completed']).withMessage('Invalid status')
];

// POST /api/admin/reservations - Create new reservation
router.post('/',
  auth,
  adminOnly,
  createReservationValidation,
  asyncHandler(async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 'Validation failed', 400, errors.array());
      }

      const { 
        propertyId, 
        customerName, 
        customerPhone, 
        startDate, 
        endDate, 
        totalPrice, 
        paidAmount,
        remainingAmount,
        paymentStatus,
        status,
        employerId 
      } = req.body;

      // Check if property exists and is available
      const property = await Property.findById(propertyId);
      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      if (!property.available) {
        return sendError(res, 'Property is not available for reservation', 400);
      }

      // For admin reservations, use provided employerId or leave it null
      let reservationEmployerId = employerId || null;

      // Create reservation
      const reservation = new Reservation({
        propertyId,
        employerId: reservationEmployerId,
        customerName,
        customerPhone,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice,
        paidAmount,
        remainingAmount,
        paymentStatus: paymentStatus || 'pending',
        status: status || 'pending'
      });

      await reservation.save();

      // Create notification for new reservation
      try {
        // Debug: Log user object
        console.log('🔍 User object from req.user:', JSON.stringify(req.user, null, 2));
        console.log('🔍 User ID:', req.user._id);
        
        // Fetch user data to get proper name
        const userData = await User.findById(req.user._id);
        console.log('🔍 Fetched user data:', userData);
        
        const creatorName = userData?.firstName && userData?.lastName 
          ? `${userData.firstName} ${userData.lastName}` 
          : userData?.username || userData?.name || 'System';
          
        console.log('🔍 Creator name determined:', creatorName);
        
        const notificationData = {
          type: 'reservation',
          title: 'حجز جديد',
          message: `تم إنشاء حجز جديد للعميل ${customerName} للعقار ${property.title}`,
          reservationId: reservation._id,
          propertyId: propertyId,
          userId: req.user._id,
          metadata: {
            customerName: customerName,
            propertyTitle: property.title,
            customerPhone: customerPhone,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            totalPrice: totalPrice,
            paymentStatus: paymentStatus || 'pending',
            employerId: employerId || null,
            createdById: req.user._id,
            createdByName: creatorName,
            createdAt: new Date()
          }
        };
        
        console.log('🔍 Full notification data being saved:', JSON.stringify(notificationData, null, 2));
        
        const savedNotification = await Notification.create(notificationData);
        console.log('🔍 Saved notification from database:', JSON.stringify(savedNotification, null, 2));
        console.log('🔔 Notification created for reservation:', reservation._id);
      } catch (notificationError) {
        console.error('Failed to create notification:', notificationError);
        // Continue with reservation creation even if notification fails
      }

      // Update property to mark as reserved
      await Property.findByIdAndUpdate(
        propertyId,
        { isReserved: true },
        { new: true }
      );

      console.log('🟢 BACKEND: Admin reservation created and property marked as reserved:', {
        reservationId: reservation._id,
        propertyId: propertyId,
        propertyTitle: property.title
      });

      // Log history entry for reservation creation
      try {
        await History.createReservationHistory({
          action: 'reservation_created',
          reservationId: reservation._id,
          userId: req.user._id,
          description: `تم إنشاء حجز جديد للعميل ${customerName} للعقار ${property.title}`,
          metadata: {
            customerName,
            customerPhone,
            startDate,
            endDate,
            totalPrice,
            paidAmount,
            remainingAmount,
            paymentStatus: reservation.paymentStatus,
            status: reservation.status,
            propertyTitle: property.title,
            propertyId: property._id,
            propertyPricePerDay: property.pricePerDay,
            employerId: reservationEmployerId,
            createdAt: reservation.createdAt,
            reservationId: reservation._id
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
      } catch (historyError) {
        console.error('Failed to create history entry:', historyError);
        // Don't fail the request if history logging fails
      }

      sendSuccess(res, 'Reservation created successfully', { reservation }, 201);
    } catch (error) {
      console.error('Reservation creation error:', error);
      if (error.name === 'ValidationError') {
        return sendError(res, 'Validation failed', 400, error.message);
      }
      sendError(res, 'Failed to create reservation', 500, error.message);
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
      const limit = parseInt(req.query.limit) || 50; // Increased limit for details view
      const skip = (page - 1) * limit;
      const search = req.query.search || '';
      const { wilayaId, officeId, employerId } = req.query;

      // Build filter object
      const filter = {};
      if (search) {
        filter.$or = [
          { customerName: { $regex: search, $options: 'i' } },
          { customerPhone: { $regex: search, $options: 'i' } }
        ];
      }

      // Handle location-based filters
      if (wilayaId || officeId || employerId) {
        // Need to lookup properties to filter by location
        const propertyFilter = {};
        if (wilayaId) propertyFilter.wilayaId = wilayaId;
        if (officeId) propertyFilter.officeId = officeId;
        
        if (Object.keys(propertyFilter).length > 0) {
          const properties = await Property.find(propertyFilter).select('_id');
          const propertyIds = properties.map(p => p._id);
          filter.propertyId = { $in: propertyIds };
        }
      }

      // Handle employer filter
      if (employerId) {
        filter.employerId = employerId;
      }

      console.log('🔍 Reservation filter:', filter);

      const reservations = await Reservation.find(filter)
        .populate([
          { path: 'propertyId', select: 'title description pricePerDay wilayaId officeId' },
          { path: 'employerId', select: 'username firstName lastName' }
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Reservation.countDocuments(filter);

      console.log(`📊 Found ${reservations.length} reservations (total: ${total})`);

      sendSuccess(res, 'Reservations retrieved successfully', {
        data: reservations, // Changed to 'data' to match frontend expectation
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get reservations error:', error);
      sendError(res, 'Failed to retrieve reservations', 500, error.message);
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

      const { 
        customerName, 
        customerPhone, 
        startDate, 
        endDate, 
        totalPrice, 
        paidAmount,
        remainingAmount,
        paymentStatus,
        status 
      } = req.body;
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
      if (paidAmount !== undefined) reservation.paidAmount = paidAmount;
      if (remainingAmount !== undefined) reservation.remainingAmount = remainingAmount;
      if (paymentStatus) reservation.paymentStatus = paymentStatus;
      if (status) reservation.status = status;

      await reservation.save();

      // Create notification for reservation update
      try {
        const updatedProperty = await Property.findById(reservation.propertyId);
        
        // Fetch user data to get proper name
        const userData = await User.findById(req.user._id);
        const creatorName = userData?.firstName && userData?.lastName 
          ? `${userData.firstName} ${userData.lastName}` 
          : userData?.username || userData?.name || 'System';
        
        await Notification.create({
          type: 'reservation',
          title: 'تم تحديث الحجز',
          message: `تم تحديث حجز العميل ${reservation.customerName} للعقار ${updatedProperty?.title || 'Unknown'}`,
          reservationId: reservation._id,
          propertyId: reservation.propertyId,
          userId: req.user._id,
          metadata: {
            customerName: reservation.customerName,
            propertyTitle: updatedProperty?.title || 'Unknown',
            customerPhone: reservation.customerPhone,
            startDate: reservation.startDate,
            endDate: reservation.endDate,
            totalPrice: reservation.totalPrice,
            paymentStatus: reservation.paymentStatus,
            status: reservation.status,
            employerId: reservation.employerId,
            createdById: req.user._id,
            createdByName: creatorName,
            createdAt: new Date(),
            action: 'updated',
            changes: {
              customerName: customerName !== undefined,
              customerPhone: customerPhone !== undefined,
              startDate: startDate !== undefined,
              endDate: endDate !== undefined,
              totalPrice: totalPrice !== undefined,
              paidAmount: paidAmount !== undefined,
              remainingAmount: remainingAmount !== undefined,
              paymentStatus: paymentStatus !== undefined,
              status: status !== undefined
            }
          }
        });
        console.log('🔔 Notification created for reservation update:', reservation._id);
      } catch (notificationError) {
        console.error('Failed to create notification:', notificationError);
        // Continue with reservation update even if notification fails
      }

      // Log history entry for reservation update
      try {
        const updatedProperty = await Property.findById(reservation.propertyId);
        await History.createReservationHistory({
          action: 'reservation_updated',
          reservationId: reservation._id,
          userId: req.user._id,
          description: `تم تحديث حجز العميل ${reservation.customerName}`,
          metadata: {
            customerName: reservation.customerName,
            customerPhone: reservation.customerPhone,
            startDate: reservation.startDate,
            endDate: reservation.endDate,
            totalPrice: reservation.totalPrice,
            paidAmount: reservation.paidAmount,
            remainingAmount: reservation.remainingAmount,
            paymentStatus: reservation.paymentStatus,
            status: reservation.status,
            propertyTitle: updatedProperty?.title || 'Unknown',
            propertyId: reservation.propertyId,
            propertyPricePerDay: updatedProperty?.pricePerDay,
            employerId: reservation.employerId,
            changes: {
              customerName: customerName !== undefined,
              customerPhone: customerPhone !== undefined,
              startDate: startDate !== undefined,
              endDate: endDate !== undefined,
              totalPrice: totalPrice !== undefined,
              paidAmount: paidAmount !== undefined,
              remainingAmount: remainingAmount !== undefined,
              paymentStatus: paymentStatus !== undefined,
              status: status !== undefined
            },
            updatedAt: reservation.updatedAt,
            reservationId: reservation._id
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
      } catch (historyError) {
        console.error('Failed to create history entry:', historyError);
        // Don't fail the request if history logging fails
      }

      sendSuccess(res, 'Reservation updated successfully', { reservation });
    } catch (error) {
      console.error('Reservation update error:', error);
      if (error.name === 'ValidationError') {
        return sendError(res, 'Validation failed', 400, error.message);
      }
      sendError(res, 'Failed to update reservation', 500, error.message);
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

      const reservationData = { ...reservation.toObject() };

      await Reservation.findByIdAndDelete(reservationId);

      // Log history entry for reservation deletion
      try {
        const deletedProperty = await Property.findById(reservationData.propertyId);
        await History.createReservationHistory({
          action: 'reservation_cancelled',
          reservationId: reservationData._id,
          userId: req.user._id,
          description: `تم إلغاء حجز العميل ${reservationData.customerName}`,
          metadata: {
            customerName: reservationData.customerName,
            customerPhone: reservationData.customerPhone,
            startDate: reservationData.startDate,
            endDate: reservationData.endDate,
            totalPrice: reservationData.totalPrice,
            paidAmount: reservationData.paidAmount,
            remainingAmount: reservationData.remainingAmount,
            paymentStatus: reservationData.paymentStatus,
            status: reservationData.status,
            propertyTitle: deletedProperty?.title || 'Unknown',
            propertyId: reservationData.propertyId,
            propertyPricePerDay: deletedProperty?.pricePerDay,
            employerId: reservationData.employerId,
            deletedAt: new Date(),
            originalCreatedAt: reservationData.createdAt,
            reservationId: reservationData._id
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
      } catch (historyError) {
        console.error('Failed to create history entry:', historyError);
        // Don't fail the request if history logging fails
      }

      sendSuccess(res, 'Reservation deleted successfully', { reservation: reservationData });
    } catch (error) {
      console.error('Reservation delete error:', error);
      sendError(res, 'Failed to delete reservation', 500, error.message);
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
