const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const User = require('../models/user.model');
const Property = require('../models/property.model');
const Office = require('../models/office.model');
const { body, validationResult } = require('express-validator');

// Validation rules for user creation
const createUserValidation = [
  body('username')
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 30 }).withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('email')
    .optional()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('firstName')
    .optional()
    .isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters')
    .trim(),
  body('lastName')
    .optional()
    .isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters')
    .trim(),
  body('phone')
    .optional()
    .isLength({ max: 20 }).withMessage('Phone number cannot exceed 20 characters')
    .trim(),
  body('role')
    .optional()
    .isIn(['admin', 'sous admin', 'employee', 'customer']).withMessage('Invalid role'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be a boolean')
];

router.get('/test', 
  auth, 
  adminOnly, 
  asyncHandler(async (req, res) => {
    sendSuccess(res, 'Admin access granted', {
      user: {
        id: req.user._id,
        name: req.user.fullName,
        email: req.user.email,
        role: req.user.role
      },
      message: 'You have admin privileges',
      timestamp: new Date().toISOString()
    });
  })
);

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
      const user = await User.findById(req.params.id).select('-password').populate('office', 'name');
      
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
      const { username, password, email, firstName, lastName, phone, role, isActive } = req.body;

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
      ).select('-password').populate('office', 'name');

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
      const updates = req.body;

      // Remove sensitive fields that shouldn't be updated directly
      delete updates._id;
      delete updates.createdAt;
      delete updates.updatedAt;

      const property = await Property.findByIdAndUpdate(
        propertyId,
        updates,
        { new: true, runValidators: true }
      );

      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      sendSuccess(res, 'Property updated successfully', { property });
    } catch (error) {
      sendError(res, 'Failed to update property', error);
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

      // Toggle between 'available' and 'unavailable'
      property.status = property.status === 'available' ? 'unavailable' : 'available';
      await property.save();

      sendSuccess(res, 'Property status updated successfully', {
        property: {
          id: property._id,
          title: property.title,
          status: property.status
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
    const Booking = require('../models/booking.model');
    const Office = require('../models/office.model');

    const [
      totalUsers,
      totalProperties,
      totalBookings,
      totalOffices,
      activeBookings,
      availableProperties
    ] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      Booking.countDocuments(),
      Office.countDocuments(),
      Booking.countDocuments({ status: { $in: ['pending', 'confirmed'] } }),
      Property.countDocuments({ status: 'available' })
    ]);

    sendSuccess(res, 'Admin statistics retrieved successfully', {
      users: {
        total: totalUsers,
        customers: await User.countDocuments({ role: 'customer' }),
        employees: await User.countDocuments({ role: 'employee' }),
        admins: await User.countDocuments({ role: 'admin' })
      },
      properties: {
        total: totalProperties,
        available: availableProperties,
        apartments: await Property.countDocuments({ type: 'apartment' }),
        villas: await Property.countDocuments({ type: 'villa' }),
        shops: await Property.countDocuments({ type: 'shop' })
      },
      bookings: {
        total: totalBookings,
        active: activeBookings,
        pending: await Booking.countDocuments({ status: 'pending' }),
        confirmed: await Booking.countDocuments({ status: 'confirmed' }),
        completed: await Booking.countDocuments({ status: 'completed' }),
        cancelled: await Booking.countDocuments({ status: 'cancelled' })
      },
      offices: {
        total: totalOffices,
        active: await Office.countDocuments({ isActive: true })
      }
    });
  })
);

module.exports = router;
