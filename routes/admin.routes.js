const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middlewares/auth.middleware');
const { adminOnly, adminOrSousAdmin } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const User = require('../models/user.model');
const Property = require('../models/property.model');
const Office = require('../models/office.model');
const Wilaya = require('../models/wilaya.model');
const Reservation = require('../models/reservation.model');
const History = require('../models/history.model');
const OrdersReservation = require('../models/ordersReservation.model');
const AdminSettings = require('../models/adminSettings.model');
const { body, validationResult } = require('express-validator');

// Import route modules
const wilayaRoutes = require('./wilaya.routes');
const officeRoutes = require('./office.routes');
const propertyRoutes = require('./property.routes');
const reservationRoutes = require('./reservation.routes');
const ordersReservationRoutes = require('./ordersReservation.routes');
const notificationRoutes = require('./notification.routes');
const backupRoutes = require('./backup.routes');

// Mount route modules
router.use('/wilayas', wilayaRoutes);
router.use('/offices', officeRoutes);
router.use('/properties', propertyRoutes);
router.use('/reservations', reservationRoutes);
router.use('/orders-reservation', ordersReservationRoutes);
router.use('/notifications', notificationRoutes);
router.use('/', backupRoutes);

// Validation rules for user creation
const createUserValidation = [
  body('name')
    .notEmpty().withMessage('Name is required')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters')
    .trim(),
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['admin', 'employer', 'sousAdmin']).withMessage('Role must be either admin, employer, or sousAdmin'),
  body('officeId')
    .optional()
    .isMongoId().withMessage('Invalid Office ID')
];

// Validation rules for user update
const updateUserValidation = [
  body('name')
    .optional()
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters')
    .trim(),
  body('email')
    .optional()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .optional()
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('role')
    .optional()
    .isIn(['admin', 'employer', 'sousAdmin']).withMessage('Role must be either admin, employer, or sousAdmin'),
  body('officeId')
    .optional()
    .isMongoId().withMessage('Invalid Office ID')
];

// GET /api/admin/users - Get all users with pagination and filtering
router.get('/users',
  auth,
  adminOrSousAdmin,
  asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const search = req.query.search || '';
      const role = req.query.role || '';
      const isActive = req.query.isActive;

      // Build filter object
      const filter = {};
      if (search) {
        filter.$or = [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ];
      }
      if (role) {
        filter.role = role;
      }
      if (isActive !== undefined) {
        filter.isActive = isActive === 'true';
      }

      const users = await User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await User.countDocuments(filter);

      sendSuccess(res, 'Users retrieved successfully', {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      sendError(res, 'Failed to retrieve users', error);
    }
  })
);

// GET /api/admin/users/:id - Get single user by ID
router.get('/users/:id',
  auth,
  adminOrSousAdmin,
  asyncHandler(async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select('-password').populate('officeId', 'name');
      
      if (!user) {
        return sendError(res, 'User not found', 404);
      }

      sendSuccess(res, 'User retrieved successfully', { user });
    } catch (error) {
      sendError(res, 'Failed to retrieve user', error);
    }
  })
);

// Test route to verify admin routes are working
router.get('/test-route', (req, res) => {
  res.json({ message: 'Admin routes are working', timestamp: new Date().toISOString() });
});

// POST /api/admin/users - Create new user
router.post('/users',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const { username, password, email, firstName, lastName, phone, role, isActive, officeId, image } = req.body;

      // Simple validation
      if (!username || !password) {
        return sendError(res, 'Username and password are required', 400);
      }

      if (username.length < 3) {
        return sendError(res, 'Username must be at least 3 characters', 400);
      }

      if (password.length < 6) {
        return sendError(res, 'Password must be at least 6 characters', 400);
      }

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [
          { username: username.toLowerCase() },
          { email: email?.toLowerCase() }
        ].filter(Boolean)
      });

      if (existingUser) {
        return sendError(res, 'User with this username or email already exists', 409,existingUser);
      }

      // Create new user
      const user = new User({
        username,
        email,
        firstName,
        lastName,
        phone,
        role,
        password,
        officeId,
        image,
        isActive: isActive !== undefined ? isActive : true
      });

      await user.save();

      sendSuccess(res, 'User created successfully', {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt
        }
      }, 201);
    } catch (error) {
      console.log(error)
      sendError(res, 'Failed to create user', error);
    }
  })
);

// PUT /api/admin/users/:id - Update user
router.put('/users/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const userId = req.params.id;
      const updates = req.body;

      // Remove sensitive fields that shouldn't be updated directly
      delete updates._id;

      // Handle password update separately if provided
      let passwordUpdate = null;
      if (updates.password) {
        // Validate password strength
        if (updates.password.length < 6) {
          return sendError(res, 'Password must be at least 6 characters long', 400);
        }
        
        passwordUpdate = updates.password;
        delete updates.password; // Remove from regular updates
      }

      // Update user fields
      const user = await User.findByIdAndUpdate(
        userId,
        updates,
        { new: true, runValidators: true }
      ).select('-password').populate('officeId', 'name');

      if (!user) {
        return sendError(res, 'User not found', 404);
      }

      // Update password if provided
      if (passwordUpdate) {
        const userForPassword = await User.findById(userId);
        userForPassword.password = passwordUpdate;
        await userForPassword.save();
      }

      sendSuccess(res, 'User updated successfully', { user });
    } catch (error) {
      sendError(res, 'Failed to update user', error);
    }
  })
);

// PATCH /api/admin/users/:id/toggle-status - Toggle user active status
router.patch('/users/:id/toggle-status',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId);

      if (!user) {
        return sendError(res, 'User not found', 404);
      }

      user.isActive = !user.isActive;
      await user.save();

      sendSuccess(res, 'User status updated successfully', {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          isActive: user.isActive
        }
      });
    } catch (error) {
      sendError(res, 'Failed to update user status', error);
    }
  })
);

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId);

      if (!user) {
        return sendError(res, 'User not found', 404);
      }

      // Prevent deletion of admin users
      if (user.role === 'admin') {
        return sendError(res, 'Cannot delete admin users', 403);
      }

      await User.findByIdAndDelete(userId);

      sendSuccess(res, 'User deleted successfully');
    } catch (error) {
      sendError(res, 'Failed to delete user', error);
    }
  })
);

// GET /api/admin/properties - Get all properties with filtering (no pagination)
router.get('/properties',
  auth,
  adminOrSousAdmin,
  asyncHandler(async (req, res) => {
    try {
      const search = req.query.search || '';
      const type = req.query.type || '';
      const status = req.query.status || '';

      // Build filter object
      const filter = {};
      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { wilaya: { $regex: search, $options: 'i' } },
          { city: { $regex: search, $options: 'i' } }
        ];
      }
      if (type) {
        filter.type = type;
      }
      if (status) {
        filter.status = status;
      }

      const properties = await Property.find(filter)
        .populate([
          { path: 'wilayaId', select: 'name code' },
          { path: 'officeId', select: 'name code' },
          { 
            path: 'reservationIds', 
            select: 'customerName customerPhone status startDate endDate totalPrice paidAmount remainingAmount paymentStatus employerId'
          }
        ])
        .sort({ createdAt: -1 });

      sendSuccess(res, 'Properties retrieved successfully', {
        properties
      });
    } catch (error) {
      sendError(res, 'Failed to retrieve properties', error);
    }
  })
);

// GET /api/admin/properties/:id - Get single property by ID
router.get('/properties/:id',
  auth,
  adminOrSousAdmin,
  asyncHandler(async (req, res) => {
    try {
      const property = await Property.findById(req.params.id);
      
      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      sendSuccess(res, 'Property retrieved successfully', { property });
    } catch (error) {
      sendError(res, 'Failed to retrieve property', error);
    }
  })
);

// POST /api/admin/properties - Create new property
router.post('/properties',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const propertyData = req.body;

      // Create new property
      const property = new Property(propertyData);
      await property.save();

      sendSuccess(res, 'Property created successfully', {
        property
      }, 201);
    } catch (error) {
      sendError(res, 'Failed to create property', error);
    }
  })
);

// Test endpoint to debug property update
router.get('/properties/:id/debug',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const propertyId = req.params.id;
      
      // Get current property
      const property = await Property.findById(propertyId);
      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      // Check for active reservations
      const Reservation = require('../models/reservation.model');
      const activeReservations = await Reservation.find({
        propertyId: propertyId,
        status: { $in: ['pending', 'confirmed', 'approved'] }
      });

      // Try direct update
      const updateResult = await Property.updateOne(
        { _id: propertyId },
        { $set: { isReserved: false } }
      );

      // Get property after update
      const updatedProperty = await Property.findById(propertyId);

      // Try raw MongoDB update
      const db = mongoose.connection.db;
      const rawResult = await db.collection('properties').updateOne(
        { _id: new mongoose.Types.ObjectId(propertyId) },
        { $set: { isReserved: false, testField: 'test' } }
      );

      // Get property after raw update
      const rawProperty = await Property.findById(propertyId);

      sendSuccess(res, 'Debug info retrieved', {
        originalProperty: {
          id: property._id,
          available: property.available,
          isReserved: property.isReserved
        },
        activeReservationsCount: activeReservations.length,
        activeReservations: activeReservations.map(r => ({ id: r._id, status: r.status })),
        updateResult: updateResult,
        updatedProperty: {
          id: updatedProperty._id,
          available: updatedProperty.available,
          isReserved: updatedProperty.isReserved
        },
        rawUpdateResult: rawResult,
        rawProperty: {
          id: rawProperty._id,
          available: rawProperty.available,
          isReserved: rawProperty.isReserved,
          testField: rawProperty.testField
        }
      });
    } catch (error) {
      console.error('Debug endpoint error:', error);
      sendError(res, 'Debug endpoint failed', 500, error.message);
    }
  })
);

// Remove the conflicting PUT route - it's handled in property.routes.js

// PUT /api/admin/properties/:id - Update property (for admin)
router.put('/properties/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const propertyId = req.params.id;
      const { available, isReserved } = req.body;

      // Check if property exists
      const property = await Property.findById(propertyId);
      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      // Build update object
      const updateData = {};
      if (available !== undefined) {
        updateData.available = available;
      }
      
      if (isReserved !== undefined) {
        updateData.isReserved = isReserved;
      }

      // Only update if there's something to update
      if (Object.keys(updateData).length > 0) {
        // Use findOneAndUpdate to bypass middleware and ensure atomic update
        const updatedProperty = await Property.findOneAndUpdate(
          { _id: propertyId },
          updateData,
          { 
            new: true, 
            runValidators: false,
            context: 'manual' // Add context to identify manual updates
          }
        );

        sendSuccess(res, 'Property updated successfully', { property: updatedProperty });
        return;
      }

      // If no update needed, return original property
      sendSuccess(res, 'Property updated successfully', { property });
    } catch (error) {
      console.error('Update property error:', error);
      sendError(res, 'Failed to update property', 500, error.message);
    }
  })
);

// PATCH /api/admin/properties/:id/toggle-status - Toggle property status
router.patch('/properties/:id/toggle-status',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const propertyId = req.params.id;
      const property = await Property.findById(propertyId);

      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      // Toggle between reserved and not reserved
      const newIsReserved = !property.isReserved;
      const newAvailable = newIsReserved ? false : true;

      await Property.updateOne(
        { _id: propertyId },
        { 
          isReserved: newIsReserved,
          available: newAvailable
        },
        { runValidators: false }
      );

      // Get updated property
      const updatedProperty = await Property.findById(propertyId);

      sendSuccess(res, 'Property status updated successfully', {
        property: {
          id: updatedProperty._id,
          title: updatedProperty.title,
          available: updatedProperty.available,
          isReserved: updatedProperty.isReserved
        }
      });
    } catch (error) {
      sendError(res, 'Failed to update property status', error);
    }
  })
);

// DELETE /api/admin/properties/:id - Delete property
router.delete('/properties/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const propertyId = req.params.id;
      const property = await Property.findById(propertyId);

      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      await Property.findByIdAndDelete(propertyId);

      sendSuccess(res, 'Property deleted successfully');
    } catch (error) {
      sendError(res, 'Failed to delete property', error);
    }
  })
);

// GET /api/admin/offices - Get all offices with pagination and filtering
router.get('/offices',
  auth,
  adminOrSousAdmin,
  asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const search = req.query.search || '';
      const isActive = req.query.isActive;

      // Build filter object
      const filter = {};
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { 'address.city': { $regex: search, $options: 'i' } },
          { 'address.wilaya': { $regex: search, $options: 'i' } }
        ];
      }
      if (isActive !== undefined) {
        filter.isActive = isActive === 'true';
      }

      const offices = await Office.find(filter)
        .populate('manager', 'firstName lastName email')
        .populate('employees', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Office.countDocuments(filter);

      sendSuccess(res, 'Offices retrieved successfully', {
        offices,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      sendError(res, 'Failed to retrieve offices', error);
    }
  })
);

// GET /api/admin/offices/:id - Get single office by ID
router.get('/offices/:id',
  auth,
  adminOrSousAdmin,
  asyncHandler(async (req, res) => {
    try {
      const office = await Office.findById(req.params.id)
        .populate('manager', 'firstName lastName email')
        .populate('employees', 'firstName lastName email');
      
      if (!office) {
        return sendError(res, 'Office not found', 404);
      }

      sendSuccess(res, 'Office retrieved successfully', { office });
    } catch (error) {
      sendError(res, 'Failed to retrieve office', error);
    }
  })
);

// POST /api/admin/offices - Create new office
router.post('/offices',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const officeData = req.body;

      // Create new office
      const office = new Office(officeData);
      await office.save();

      // Populate manager and employees for response
      await office.populate('manager', 'firstName lastName email');
      await office.populate('employees', 'firstName lastName email');

      sendSuccess(res, 'Office created successfully', {
        office
      }, 201);
    } catch (error) {
      sendError(res, 'Failed to create office', error);
    }
  })
);

// PUT /api/admin/offices/:id - Update office
router.put('/offices/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const officeId = req.params.id;
      const updates = req.body;

      // Remove sensitive fields that shouldn't be updated directly
      delete updates._id;
      delete updates.createdAt;
      delete updates.updatedAt;

      const office = await Office.findByIdAndUpdate(
        officeId,
        updates,
        { new: true, runValidators: true }
      ).populate('manager', 'firstName lastName email')
       .populate('employees', 'firstName lastName email');

      if (!office) {
        return sendError(res, 'Office not found', 404);
      }

      sendSuccess(res, 'Office updated successfully', { office });
    } catch (error) {
      sendError(res, 'Failed to update office', error);
    }
  })
);

// PATCH /api/admin/offices/:id/toggle-status - Toggle office active status
router.patch('/offices/:id/toggle-status',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const officeId = req.params.id;
      const office = await Office.findById(officeId);

      if (!office) {
        return sendError(res, 'Office not found', 404);
      }

      office.isActive = !office.isActive;
      await office.save();

      sendSuccess(res, 'Office status updated successfully', {
        office: {
          id: office._id,
          name: office.name,
          isActive: office.isActive
        }
      });
    } catch (error) {
      sendError(res, 'Failed to update office status', error);
    }
  })
);

// DELETE /api/admin/offices/:id - Delete office
router.delete('/offices/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const officeId = req.params.id;
      const office = await Office.findById(officeId);

      if (!office) {
        return sendError(res, 'Office not found', 404);
      }

      await Office.findByIdAndDelete(officeId);

      sendSuccess(res, 'Office deleted successfully');
    } catch (error) {
      sendError(res, 'Failed to delete office', error);
    }
  })
);

router.get('/stats',
  auth,
  adminOrSousAdmin,
  asyncHandler(async (req, res) => {
    const User = require('../models/user.model');
    const Property = require('../models/property.model');
    const Reservation = require('../models/reservation.model');
    const Office = require('../models/office.model');

    const [
      totalUsers,
      totalProperties,
      totalReservations,
      totalOffices,
      activeReservations,
      availableProperties
    ] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      Reservation.countDocuments(),
      Office.countDocuments(),
      Reservation.countDocuments({ status: { $in: ['pending', 'approved'] } }),
      Property.countDocuments({ available: true })
    ]);

    sendSuccess(res, 'Admin statistics retrieved successfully', {
      users: {
        total: totalUsers,
        employers: await User.countDocuments({ role: 'employer' }),
        admins: await User.countDocuments({ role: 'admin' })
      },
      properties: {
        total: totalProperties,
        available: availableProperties
      },
      reservations: {
        total: totalReservations,
        active: activeReservations,
        pending: await Reservation.countDocuments({ status: 'pending' }),
        approved: await Reservation.countDocuments({ status: 'approved' }),
        cancelled: await Reservation.countDocuments({ status: 'cancelled' })
      },
      offices: {
        total: totalOffices
      }
    });
  })
);

// GET /api/admin/history - Get history with pagination and filtering
router.get('/history',
  auth,
  adminOrSousAdmin,
  asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const action = req.query.action || '';
      const entityType = req.query.entityType || '';
      const userId = req.query.userId || '';
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;

      // Build filter object
      const filter = {};
      
      if (action) {
        filter.action = action;
      }
      
      if (entityType) {
        filter.entityType = entityType;
      }
      
      if (userId) {
        filter.userId = userId;
      }
      
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) {
          filter.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          filter.createdAt.$lte = new Date(endDate);
        }
      }

      const skip = (page - 1) * limit;

      const history = await History.find(filter)
        .populate('userId', 'username firstName lastName email')
        .populate('reservationId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await History.countDocuments(filter);

      sendSuccess(res, 'History retrieved successfully', {
        history,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      sendError(res, 'Failed to retrieve history', error);
    }
  })
);

// GET /api/admin/history/reservations - Get reservation-specific history
router.get('/history/reservations',
  auth,
  adminOrSousAdmin,
  asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const action = req.query.action || '';

      const result = await History.getReservationHistory(
        action ? { action } : {},
        { page, limit }
      );

      sendSuccess(res, 'Reservation history retrieved successfully', result);
    } catch (error) {
      sendError(res, 'Failed to retrieve reservation history', error);
    }
  })
);

// GET /api/admin/history - Get all history records
router.get('/history',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const action = req.query.action || '';
      const entityType = req.query.entityType || '';

      const skip = (page - 1) * limit;
      
      // Build query
      const query = {};
      if (action) query.action = action;
      if (entityType) query.entityType = entityType;
      
      const history = await History.find(query)
        .populate('userId', 'username firstName lastName email')
        .populate('reservationId', 'customerName customerPhone totalPrice status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      const total = await History.countDocuments(query);
      
      const result = {
        history,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

      sendSuccess(res, 'History retrieved successfully', result);
    } catch (error) {
      sendError(res, 'Failed to retrieve history', error);
    }
  })
);

// GET /api/admin/settings - Get admin settings
router.get('/settings',
  auth,
  adminOrSousAdmin,
  asyncHandler(async (req, res) => {
    try {
      const settings = await AdminSettings.getSettings();
      sendSuccess(res, 'Settings retrieved successfully', settings);
    } catch (error) {
      sendError(res, 'Failed to retrieve settings', error);
    }
  })
);

// PUT /api/admin/settings/auto-accept - Update auto-accept orders setting
router.put('/settings/auto-accept',
  auth,
  adminOnly,
  [
    body('autoAcceptOrders')
      .isBoolean()
      .withMessage('autoAcceptOrders must be a boolean')
  ],
  asyncHandler(async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 'Validation failed', errors.array());
      }

      const { autoAcceptOrders } = req.body;
      const settings = await AdminSettings.updateAutoAcceptOrders(autoAcceptOrders);
      
      sendSuccess(res, 'Auto-accept setting updated successfully', settings);
    } catch (error) {
      sendError(res, 'Failed to update auto-accept setting', error);
    }
  })
);

module.exports = router;
