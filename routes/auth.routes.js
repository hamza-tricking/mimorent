const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const { jwtSecret, jwtExpire } = require('../config/env');
const { sendSuccess, sendError, sendUnauthorized, sendBadRequest } = require('../utils/response.util');
const { validateRequest, userValidationSchema } = require('../utils/validation.util');
const { asyncHandler } = require('../middlewares/error.middleware');

const generateToken = (id) => {
  return jwt.sign({ id }, jwtSecret, {
    expiresIn: jwtExpire
  });
};

router.post('/register',
  validateRequest(userValidationSchema),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, email, password, phone, role = 'customer', dateOfBirth, address } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendBadRequest(res, 'User with this email already exists');
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      phone,
      role,
      dateOfBirth,
      address
    });

    const token = generateToken(user._id);

    sendSuccess(res, 'User registered successfully', {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        fullName: user.fullName
      },
      token
    }, 201);
  })
);

router.post('/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return sendBadRequest(res, 'Please provide username and password');
    }

    const user = await User.findOne({ username }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return sendUnauthorized(res, 'Invalid username or password');
    }

    if (!user.isActive) {
      return sendUnauthorized(res, 'Account is deactivated');
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    sendSuccess(res, 'Login successful', {
      user: {
        id: user._id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        lastLogin: user.lastLogin
      },
      token
    });
  })
);

router.get('/me',
  asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return sendUnauthorized(res, 'No token provided');
    }

    try {
      const decoded = jwt.verify(token, jwtSecret);
      const user = await User.findById(decoded.id);

      if (!user) {
        return sendUnauthorized(res, 'User not found');
      }

      sendSuccess(res, 'User profile retrieved', {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          phone: user.phone,
          address: user.address,
          dateOfBirth: user.dateOfBirth,
          avatar: user.avatar,
          isActive: user.isActive,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        }
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return sendUnauthorized(res, 'Token expired');
      } else if (error.name === 'JsonWebTokenError') {
        return sendUnauthorized(res, 'Invalid token');
      } else {
        throw error;
      }
    }
  })
);

module.exports = router;
