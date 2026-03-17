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

    // Additional validation for targetAudience and capacity
    if (property.targetAudience === 'family' && !isMarried) {
      console.log('🔴 Marital status validation failed for family property');
      return sendError(res, 'هذا العقار مخصص للعائلات فقط. يرجى اختيار "متزوج" للمتابعة.', 400);
    }
    
    if (property.targetAudience === 'normal' && isMarried) {
      console.log('🔴 Marital status validation failed for normal property');
      return sendError(res, 'هذا العقار مخصص للأفراد فقط. يرجى اختيار "أعزب" للمتابعة.', 400);
    }
    
    // Check if number of people exceeds property capacity
    if (property.capacity && numberOfPeople > property.capacity) {
      console.log('🔴 Capacity validation failed');
      return sendError(res, `سعة هذا العقار لا تتجاوز ${property.capacity} أشخاص. يرجى تقليل عدد الأشخاص.`, 400);
    }
    
    // Additional validation for family properties
    if (property.targetAudience === 'family' && numberOfPeople < 2) {
      console.log('🔴 Family property minimum people validation failed');
      return sendError(res, 'العقارات العائلية تتطلب شخصين على الأقل.', 400);
    }

    // Validate maximum number of identity images
    const maxImages = 4;
    if (identityImages && identityImages.length > maxImages) {
      console.log('🔴 Too many identity images');
      return sendError(res, `لا يمكن رفع أكثر من ${maxImages} صور للهوية.`, 400);
    }

    console.log('✅ Property and validation checks passed');

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

// GET /api/properties - Get available properties with advanced filtering (public)
router.get('/properties',
  asyncHandler(async (req, res) => {
    try {
      console.log('Public properties API called with filters:', req.query);

      const {
        search,
        wilayaId,
        targetAudience,
        capacity,
        propertyType,
        minPrice,
        maxPrice,
        reserveType,
        startDate,
        endDate,
        page = 1,
        limit = 20
      } = req.query;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Check if any filters are applied
      const hasFilters = search || wilayaId || targetAudience || 
                        capacity || propertyType || minPrice || maxPrice || reserveType || startDate || endDate;

      // Build base filter
      const filter = { available: true };

      if (hasFilters) {
        // Search term filter
        if (search) {
          filter.$or = [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { location: { $regex: search, $options: 'i' } }
          ];
        }

        // Wilaya filter
        if (wilayaId) {
          filter.wilayaId = wilayaId;
        }

        // Target audience filter
        if (targetAudience) {
          filter.targetAudience = targetAudience;
        }

        // Capacity filter (exact capacity or special cases)
        if (capacity) {
          if (capacity === 'unspecified') {
            // Filter for properties with no capacity specified
            filter.capacity = { $exists: false };
          } else if (capacity === '10+') {
            // Filter for properties with capacity >= 10
            filter.capacity = { $gte: 10 };
          } else {
            // Exact capacity match
            filter.capacity = parseInt(capacity);
          }
        }

        // Property type filter
        if (propertyType) {
          filter.propertyType = propertyType;
        }

        // Price range filter
        if (minPrice || maxPrice) {
          filter.pricePerDay = {};
          if (minPrice) filter.pricePerDay.$gte = parseInt(minPrice);
          if (maxPrice) filter.pricePerDay.$lte = parseInt(maxPrice);
        }

        // Reservation type filter
        if (reserveType) {
          filter.reserveTheProperty = reserveType;
        }
      }

      console.log('Filter applied:', filter);

      // Get initial properties matching all filters except date availability
      let properties = await Property.find(filter)
        .populate('wilayaId', 'name')
        .populate('officeId', 'name phone')
        .populate('reservationIds', 'endDate')
        .sort({ createdAt: -1 });

      console.log('Properties found before date filtering:', properties.length);

      // Date availability filtering (only if dates are provided)
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Validate date range
        if (start > end) {
          return sendError(res, 'Start date must be before end date', 400);
        }

        // For monthly reservations, validate the same way as reservation form
        if (reserveType === 'monthly') {
          // Calculate the difference in months
          const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
          const dayDiff = end.getDate() - start.getDate();
          
          // Check if it's exactly at least one month
          if (monthsDiff < 1) {
            return sendError(res, 'فترة الحجز غير صحيحة. يجب أن يكون تاريخ الانتهاء بعد شهر واحد على الأقل من تاريخ البدء للحجوزات الشهرية.', 400);
          }
          
          // For exactly one month, day should be the same
          if (monthsDiff === 1 && dayDiff !== 0) {
            return sendError(res, 'فترة الحجز غير صحيحة. للحجز الشهري، يجب أن يكون تاريخ الانتهاء هو نفس اليوم من الشهر التالي (مثال: 03/15/2026 → 04/15/2026).', 400);
          }
          
          // For multiple months, day should be the same
          if (monthsDiff > 1 && dayDiff !== 0) {
            return sendError(res, 'فترة الحجز غير صحيحة. للحجز الشهري، يجب أن يكون تاريخ الانتهاء هو نفس اليوم من الشهر المناسب (مثال: 03/15/2026 → 06/15/2026 لمدة 3 أشهر).', 400);
          }
        }

        const Reservation = require('../models/reservation.model');
        
        // Filter properties based on date availability
        properties = await Promise.all(
          properties.map(async (property) => {
            if (!property.reservationIds || property.reservationIds.length === 0) {
              return property; // No reservations, property is available
            }

            // Check for overlapping reservations - same logic for both daily and monthly
            const overlappingReservations = await Reservation.find({
              _id: { $in: property.reservationIds },
              status: { $in: ['pending', 'confirmed'] },
              $or: [
                {
                  startDate: { $lte: end },
                  endDate: { $gte: start }
                }
              ]
            });

            // If no overlapping reservations, property is available for these dates
            return overlappingReservations.length === 0 ? property : null;
          })
        );

        // Remove null values (properties that are not available)
        properties = properties.filter(property => property !== null);
        console.log('Properties found after date filtering:', properties.length);
      }

      // Add availability information to each property
      const propertiesWithReservationInfo = properties.map(property => {
        const propertyObj = property.toObject();
        
        // Use the property's isReserved field directly (more reliable)
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

      // Apply pagination
      const total = propertiesWithReservationInfo.length;
      const paginatedProperties = propertiesWithReservationInfo.slice(skip, skip + limitNum);

      sendSuccess(res, 'Properties retrieved successfully', {
        properties: paginatedProperties,
        pagination: hasFilters ? {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        } : undefined,
        filters: hasFilters ? {
          search,
          wilayaId,
          targetAudience,
          capacity,
          minPrice,
          maxPrice,
          reserveType,
          startDate,
          endDate
        } : undefined
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
        .populate('officeId', 'name phone');

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
