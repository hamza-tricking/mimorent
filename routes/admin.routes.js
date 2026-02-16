const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/role.middleware');
const { sendSuccess } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');

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
