const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const User = require('../models/user.model');
const Property = require('../models/property.model');
const Office = require('../models/office.model');
const Wilaya = require('../models/wilaya.model');
const Reservation = require('../models/reservation.model');
const { body, validationResult } = require('express-validator');

// Import route modules
const wilayaRoutes = require('./wilaya.routes');
const officeRoutes = require('./office.routes');
const propertyRoutes = require('./property.routes');
const reservationRoutes = require('./reservation.routes');

// Mount route modules
router.use('/wilayas', wilayaRoutes);
router.use('/offices', officeRoutes);
router.use('/properties', propertyRoutes);
router.use('/reservations', reservationRoutes);

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
    .isIn(['admin', 'employer']).withMessage('Role must be either admin or employer'),
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
    .isIn(['admin', 'employer']).withMessage('Role must be either admin or employer'),
  body('officeId')
    .optional()
    .isMongoId().withMessage('Invalid Office ID')
];

// GET /api/admin/users - Get all users with pagination and filtering
router.get('/users',
  auth,
  adminOnly,
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
  adminOnly,
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
        return sendError(res, 'User with this username or email already exists', 409);
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
      delete updates.password;
      delete updates._id;

      const user = await User.findByIdAndUpdate(
        userId,
        updates,
        { new: true, runValidators: true }
      ).select('-password').populate('officeId', 'name');

      if (!user) {
        return sendError(res, 'User not found', 404);
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

// GET /api/admin/properties - Get all properties with pagination and filtering
router.get('/properties',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
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
      sendError(res, 'Failed to retrieve properties', error);
    }
  })
);

// GET /api/admin/properties/:id - Get single property by ID
router.get('/properties/:id',
  auth,
  adminOnly,
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

// PUT /api/admin/properties/:id - Update property
router.put('/properties/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const propertyId = req.params.id;
      const { available, isReserved, ...otherUpdates } = req.body;

      console.log(`=== PROPERTY UPDATE DEBUG ===`);
      console.log(`Property ID: ${propertyId}`);
      console.log(`Request body:`, req.body);

      // Check if property exists
      const property = await Property.findById(propertyId);
      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      console.log(`Current state: available=${property.available}, isReserved=${property.isReserved}`);

      // Check for active reservations that might be affecting this
      const Reservation = require('../models/reservation.model');
      const activeReservations = await Reservation.find({
        propertyId: propertyId,
        status: { $in: ['pending', 'confirmed', 'approved'] }
      });
      
      console.log(`Active reservations found: ${activeReservations.length}`);
      if (activeReservations.length > 0) {
        console.log(`Active reservations:`, activeReservations.map(r => ({ id: r._id, status: r.status })));
      }

      // Use updateOne to bypass any middleware or hooks
      const updateData = {};
      if (available !== undefined) updateData.available = available;
      if (isReserved !== undefined) updateData.isReserved = isReserved;

      console.log(`Update data:`, updateData);

      // Direct database update using updateOne to bypass all middleware
      const updateResult = await Property.updateOne(
        { _id: propertyId },
        { $set: updateData },
        { runValidators: false }
      );

      console.log(`Update result:`, updateResult);

      // Fetch the updated property to verify
      const updatedProperty = await Property.findById(propertyId);
      console.log(`After update: available=${updatedProperty.available}, isReserved=${updatedProperty.isReserved}`);

      // If isReserved is still true, force it with another update
      if (isReserved === false && updatedProperty.isReserved === true) {
        console.log(`Forcing isReserved to false with direct update...`);
        
        // First, let's try to update it directly in MongoDB
        const forceResult = await Property.updateOne(
          { _id: propertyId },
          { $set: { isReserved: false } },
          { runValidators: false, bypassDocumentValidation: true }
        );
        
        console.log(`Force update result:`, forceResult);
        
        // Fetch again
        const finalProperty = await Property.findById(propertyId);
        console.log(`After force update: available=${finalProperty.available}, isReserved=${finalProperty.isReserved}`);
        
        // If still true, there might be a database trigger or something else
        if (finalProperty.isReserved === true) {
          console.log(`WARNING: isReserved is still true after direct update! There might be a database trigger or middleware.`);
          
          // Try one more approach - using raw MongoDB collection
          const db = mongoose.connection.db;
          const rawResult = await db.collection('properties').updateOne(
            { _id: new mongoose.Types.ObjectId(propertyId) },
            { $set: { isReserved: false } }
          );
          console.log(`Raw MongoDB update result:`, rawResult);
          
          const rawProperty = await Property.findById(propertyId);
          console.log(`After raw update: available=${rawProperty.available}, isReserved=${rawProperty.isReserved}`);
          
          sendSuccess(res, 'Property updated successfully', { property: rawProperty });
        } else {
          sendSuccess(res, 'Property updated successfully', { property: finalProperty });
        }
      } else {
        sendSuccess(res, 'Property updated successfully', { property: updatedProperty });
      }
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
  adminOnly,
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
  adminOnly,
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
  adminOnly,
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

module.exports = router;
