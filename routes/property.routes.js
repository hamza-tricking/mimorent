const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { adminOnly, employerOnly } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const Property = require('../models/property.model');
const Wilaya = require('../models/wilaya.model');
const Office = require('../models/office.model');
const { body, validationResult } = require('express-validator');

// Validation rules for property creation
const createPropertyValidation = [
  body('title')
    .notEmpty().withMessage('Property title is required')
    .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters')
    .trim(),
  body('description')
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters')
    .trim(),
  body('location')
    .notEmpty().withMessage('Location is required')
    .isLength({ max: 500 }).withMessage('Location cannot exceed 500 characters')
    .trim(),
  body('propertyType')
    .notEmpty().withMessage('Property type is required')
    .isIn(['home', 'villa', 'shop']).withMessage('Property type must be home, villa, or shop'),
  body('pricePerDay')
    .notEmpty().withMessage('Price per day is required')
    .isNumeric().withMessage('Price per day must be a number')
    .isFloat({ min: 0 }).withMessage('Price per day cannot be negative'),
  body('wilayaId')
    .notEmpty().withMessage('Wilaya ID is required')
    .isMongoId().withMessage('Invalid Wilaya ID'),
  body('officeId')
    .notEmpty().withMessage('Office ID is required')
    .isMongoId().withMessage('Invalid Office ID'),
  body('images')
    .optional()
    .isArray().withMessage('Images must be an array'),
  body('images.*')
    .optional()
    .custom((value) => {
      if (!value) return true;
      // Check if it's a valid URL or a valid local path
      const isUrl = /^https?:\/\/.+/.test(value);
      const isLocalPath = /^\/uploads\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(value);
      if (!isUrl && !isLocalPath) {
        throw new Error('Each image must be a valid URL or valid local path');
      }
      return true;
    }),
  body('available')
    .optional()
    .isBoolean().withMessage('Available must be a boolean')
];

// Validation rules for property update
const updatePropertyValidation = [
  body('title')
    .optional()
    .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters')
    .trim(),
  body('description')
    .optional()
    .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters')
    .trim(),
  body('location')
    .optional()
    .isLength({ max: 500 }).withMessage('Location cannot exceed 500 characters')
    .trim(),
  body('propertyType')
    .optional()
    .isIn(['home', 'villa', 'shop']).withMessage('Property type must be home, villa, or shop'),
  body('pricePerDay')
    .optional()
    .isNumeric().withMessage('Price per day must be a number')
    .isFloat({ min: 0 }).withMessage('Price per day cannot be negative'),
  body('wilayaId')
    .optional()
    .isMongoId().withMessage('Invalid Wilaya ID'),
  body('officeId')
    .optional()
    .isMongoId().withMessage('Invalid Office ID'),
  body('images')
    .optional()
    .isArray().withMessage('Images must be an array'),
  body('available')
    .optional()
    .isBoolean().withMessage('Available must be a boolean')
];

// POST /api/admin/properties - Create new property
router.post('/',
  auth,
  adminOnly,
  createPropertyValidation,
  asyncHandler(async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 'Validation failed', 400, errors.array());
      }

      const { title, description, location, propertyType, pricePerDay, wilayaId, officeId, images, available } = req.body;

      // Check if wilaya exists
      const wilaya = await Wilaya.findById(wilayaId);
      if (!wilaya) {
        return sendError(res, 'Wilaya not found', 404);
      }

      // Check if office exists
      const office = await Office.findById(officeId);
      if (!office) {
        return sendError(res, 'Office not found', 404);
      }

      // Check if office belongs to the specified wilaya
      if (office.wilayaId.toString() !== wilayaId) {
        return sendError(res, 'Office does not belong to the specified wilaya', 400);
      }

      const property = new Property({ 
        title, 
        description,
        location,
        propertyType,
        pricePerDay, 
        wilayaId, 
        officeId,
        images: images || [],
        available: available !== undefined ? available : true
      });
      
      await property.save();

      // Populate wilaya and office info for response
      await property.populate([
        { path: 'wilayaId', select: 'name code' },
        { path: 'officeId', select: 'name code' }
      ]);

      sendSuccess(res, 'Property created successfully', { property }, 201);
    } catch (error) {
      console.error('Property creation error:', error);
      if (error.name === 'ValidationError') {
        return sendError(res, 'Validation failed', 400, error.message);
      }
      sendError(res, 'Failed to create property', 500, error.message);
    }
  })
);

// GET /api/admin/properties - Get all properties
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
      const available = req.query.available;

      // Migration: Ensure all properties have location field
      await Property.updateMany(
        { location: { $exists: false } },
        { $set: { location: 'غير محدد' } }
      );

      // Build filter object
      const filter = {};
      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }
      if (wilayaId) {
        filter.wilayaId = wilayaId;
      }
      if (available !== undefined) {
        filter.available = available === 'true';
      }

      const properties = await Property.find(filter)
        .populate([
          { path: 'wilayaId', select: 'name code' },
          { path: 'officeId', select: 'name code' },
          { path: 'reservationId', select: 'customerName customerPhone status startDate endDate totalPrice' }
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Property.countDocuments(filter);

      sendSuccess(res, 'Properties retrieved successfully', {
        properties,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get properties error:', error);
      sendError(res, 'Failed to retrieve properties', 500, error.message);
    }
  })
);

// GET /api/admin/properties/:id - Get single property by ID
router.get('/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const property = await Property.findById(req.params.id)
        .populate([
          { path: 'wilayaId', select: 'name code' },
          { path: 'officeId', select: 'name code' },
          { path: 'reservationId', select: 'customerName customerPhone status startDate endDate totalPrice' }
        ]);
      
      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      sendSuccess(res, 'Property retrieved successfully', { property });
    } catch (error) {
      console.error('Get property error:', error);
      sendError(res, 'Failed to retrieve property', 500, error.message);
    }
  })
);

// PUT /api/admin/properties/:id - Update property
router.put('/:id',
  auth,
  adminOnly,
  updatePropertyValidation,
  asyncHandler(async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 'Validation failed', 400, errors.array());
      }

      const { title, description, location, propertyType, pricePerDay, wilayaId, officeId, images, available, isReserved } = req.body;
      const propertyId = req.params.id;

      // Check if property exists
      const property = await Property.findById(propertyId);
      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      // If making property available (isReserved: false), just update the property status
      // Reservations should remain unchanged - they will be handled separately

      // Check if wilaya exists (if provided)
      if (wilayaId) {
        const wilaya = await Wilaya.findById(wilayaId);
        if (!wilaya) {
          return sendError(res, 'Wilaya not found', 404);
        }
        property.wilayaId = wilayaId;
      }

      // Check if office exists (if provided)
      if (officeId) {
        const office = await Office.findById(officeId);
        if (!office) {
          return sendError(res, 'Office not found', 404);
        }
        
        // Check if office belongs to the specified wilaya
        const targetWilayaId = wilayaId || property.wilayaId;
        if (office.wilayaId.toString() !== targetWilayaId.toString()) {
          return sendError(res, 'Office does not belong to the specified wilaya', 400);
        }
        
        property.officeId = officeId;
      }

      // Update property
      const updateData = {};
      if (title) updateData.title = title;
      if (description) updateData.description = description;
      if (location) updateData.location = location;
      if (propertyType) updateData.propertyType = propertyType;
      if (pricePerDay) updateData.pricePerDay = pricePerDay;
      if (images) updateData.images = images;

      // Get the current reservation before updating the property
      const existingProperty = await Property.findById(property._id)
        .populate('reservationId', 'customerName customerPhone status startDate endDate totalPrice');

      console.log('🔍 Existing Property:', existingProperty);
      console.log('🔍 Existing Reservation ID:', existingProperty?.reservationId);
      console.log('🔍 Existing Reservation Details:', existingProperty?.reservationId);

      // Update the property
      const result = await Property.updateOne(
        { _id: property._id },
        { 
          $set: updateData,
          ...(isReserved === false && { reservationId: null }) // Clear reservationId when making property available
        }
      );

      // Get the updated property with populated data
      const updatedProperty = await Property.findById(property._id)
        .populate('wilayaId', 'name')
        .populate('officeId', 'name')
        .populate('reservationId', 'customerName customerPhone status startDate endDate totalPrice');

      // Create notification when property is made available
      if (isReserved === false) {
        try {
          const Notification = require('../models/notification.model');
          const User = require('../models/user.model');
          const History = require('../models/history.model');
          
          // Fetch user data to get proper name
          const userData = await User.findById(req.user._id);
          const creatorName = userData?.firstName && userData?.lastName 
            ? `${userData.firstName} ${userData.lastName}` 
            : userData?.username || userData?.name || 'System';

          console.log('🔍 Using Existing Reservation:', existingProperty?.reservationId);

          // Create notification
          const notificationData = {
            type: 'property',
            title: 'العقار أصبح متاحاً',
            message: `تم جعل العقار "${updatedProperty.title}" متاحاً للحجز`,
            propertyId: updatedProperty._id,
            userId: req.user._id,
            metadata: {
              propertyTitle: updatedProperty.title,
              propertyId: updatedProperty._id,
              action: 'made_available',
              createdById: req.user._id,
              createdByName: creatorName,
              createdAt: new Date(),
              ...(existingProperty?.reservationId && {
                previousReservation: {
                  customerName: existingProperty.reservationId.customerName,
                  customerPhone: existingProperty.reservationId.customerPhone,
                  status: existingProperty.reservationId.status,
                  startDate: existingProperty.reservationId.startDate,
                  endDate: existingProperty.reservationId.endDate,
                  totalPrice: existingProperty.reservationId.totalPrice
                }
              })
            }
          };
          
          console.log('🔍 Notification Metadata:', notificationData.metadata);
          
          await Notification.create(notificationData);
          console.log('🔔 Notification created for property availability:', updatedProperty._id);

          // Create history record
          const historyData = {
            action: 'property_updated',
            entityType: 'property',
            entityId: updatedProperty._id,
            userId: req.user._id,
            description: `تم جعل العقار "${updatedProperty.title}" متاحاً للحجز`,
            metadata: {
              propertyTitle: updatedProperty.title,
              propertyId: updatedProperty._id,
              action: 'made_available',
              previousStatus: 'reserved',
              newStatus: 'available',
              createdById: req.user._id,
              createdByName: creatorName,
              createdAt: new Date(),
              ...(existingProperty?.reservationId && {
                previousReservation: {
                  customerName: existingProperty.reservationId.customerName,
                  customerPhone: existingProperty.reservationId.customerPhone,
                  status: existingProperty.reservationId.status,
                  startDate: existingProperty.reservationId.startDate,
                  endDate: existingProperty.reservationId.endDate,
                  totalPrice: existingProperty.reservationId.totalPrice
                }
              })
            },
            ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
          };

          await History.create(historyData);
          console.log('📝 History record created for property availability:', updatedProperty._id);

        } catch (notificationError) {
          console.error('Failed to create notification/history:', notificationError);
          // Continue with property update even if notification fails
        }
      }

      sendSuccess(res, 'Property updated successfully', { property: updatedProperty });
    } catch (error) {
      console.error('Property update error:', error);
      if (error.name === 'ValidationError') {
        return sendError(res, 'Validation failed', 400, error.message);
      }
      sendError(res, 'Failed to update property', 500, error.message);
    }
  })
);

// DELETE /api/admin/properties/:id - Delete property
router.delete('/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const propertyId = req.params.id;

      // Check if property exists
      const property = await Property.findById(propertyId);
      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      await Property.findByIdAndDelete(propertyId);

      sendSuccess(res, 'Property deleted successfully', { property });
    } catch (error) {
      console.error('Delete property error:', error);
      sendError(res, 'Failed to delete property', 500, error.message);
    }
  })
);

// GET /api/admin/properties/wilaya/:wilayaId - Get properties by wilaya
router.get('/wilaya/:wilayaId',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const { wilayaId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const available = req.query.available;

      // Check if wilaya exists
      const wilaya = await Wilaya.findById(wilayaId);
      if (!wilaya) {
        return sendError(res, 'Wilaya not found', 404);
      }

      // Build filter object
      const filter = { wilayaId };
      if (available !== undefined) {
        filter.available = available === 'true';
      }

      const properties = await Property.find(filter)
        .sort({ title: 1 })
        .skip(skip)
        .limit(limit);

      const total = await Property.countDocuments(filter);

      sendSuccess(res, 'Properties retrieved successfully', {
        properties,
        wilaya: { name: wilaya.name, code: wilaya.code },
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get properties by wilaya error:', error);
      sendError(res, 'Failed to retrieve properties', 500, error.message);
    }
  })
);

module.exports = router;
