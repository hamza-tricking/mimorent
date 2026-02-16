const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const User = require('../models/user.model');
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
        .limit(limit)
        .populate('office', 'name');

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
