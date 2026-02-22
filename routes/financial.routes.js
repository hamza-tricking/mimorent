const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const Reservation = require('../models/reservation.model');
const User = require('../models/user.model');
const Office = require('../models/office.model');
const Wilaya = require('../models/wilaya.model');

// GET /api/admin/financial/stats - Get financial statistics
router.get('/stats',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const { wilayaId, officeId, employerId } = req.query;
      
      // Build base query
      const baseQuery = {};
      if (wilayaId) baseQuery.wilayaId = wilayaId;
      if (officeId) baseQuery.officeId = officeId;
      if (employerId) baseQuery.employerId = employerId;
      
      // Get current date ranges
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // Helper function to get stats for a date range
      const getStatsForDateRange = async (startDate, endDate) => {
        const matchQuery = {
          ...baseQuery,
          createdAt: {
            $gte: startDate,
            $lt: endDate
          }
        };
        
        const stats = await Reservation.aggregate([
          { $match: matchQuery },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$totalPrice' },
              totalPaid: { $sum: '$paidAmount' },
              totalPending: { $sum: '$remainingAmount' },
              reservationCount: { $sum: 1 }
            }
          }
        ]);
        
        return stats[0] || {
          totalRevenue: 0,
          totalPaid: 0,
          totalPending: 0,
          reservationCount: 0
        };
      };
      
      // Get stats for different periods
      const dailyStats = await getStatsForDateRange(today, new Date(today.getTime() + 24 * 60 * 60 * 1000));
      const weeklyStats = await getStatsForDateRange(weekStart, new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000));
      const monthlyStats = await getStatsForDateRange(monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1));
      
      // Get stats by wilaya
      const wilayaStats = await Reservation.aggregate([
        { $match: baseQuery },
        {
          $lookup: {
            from: 'wilayas',
            localField: 'wilayaId',
            foreignField: '_id',
            as: 'wilaya'
          }
        },
        { $unwind: '$wilaya' },
        {
          $group: {
            _id: '$wilayaId',
            wilayaName: { $first: '$wilaya.name' },
            totalRevenue: { $sum: '$totalPrice' },
            totalPaid: { $sum: '$paidAmount' },
            totalPending: { $sum: '$remainingAmount' },
            reservationCount: { $sum: 1 }
          }
        },
        { $sort: { totalRevenue: -1 } }
      ]);
      
      // Get stats by office
      const officeStats = await Reservation.aggregate([
        { $match: baseQuery },
        {
          $lookup: {
            from: 'offices',
            localField: 'officeId',
            foreignField: '_id',
            as: 'office'
          }
        },
        { $unwind: '$office' },
        {
          $group: {
            _id: '$officeId',
            officeName: { $first: '$office.name' },
            totalRevenue: { $sum: '$totalPrice' },
            totalPaid: { $sum: '$paidAmount' },
            totalPending: { $sum: '$remainingAmount' },
            reservationCount: { $sum: 1 }
          }
        },
        { $sort: { totalRevenue: -1 } }
      ]);
      
      // Get stats by employer
      const employerStats = await Reservation.aggregate([
        { $match: baseQuery },
        {
          $lookup: {
            from: 'users',
            localField: 'employerId',
            foreignField: '_id',
            as: 'employer'
          }
        },
        { $unwind: '$employer' },
        {
          $group: {
            _id: '$employerId',
            employerName: { $first: { $concat: ['$employer.firstName', ' ', '$employer.lastName'] } },
            totalRevenue: { $sum: '$totalPrice' },
            totalPaid: { $sum: '$paidAmount' },
            totalPending: { $sum: '$remainingAmount' },
            reservationCount: { $sum: 1 }
          }
        },
        { $sort: { totalRevenue: -1 } }
      ]);
      
      const responseData = {
        daily: dailyStats,
        weekly: weeklyStats,
        monthly: monthlyStats,
        byWilaya: wilayaStats,
        byOffice: officeStats,
        byEmployer: employerStats
      };
      
      console.log('🟢 BACKEND: Financial stats generated:', responseData);
      
      sendSuccess(res, 'Financial statistics retrieved successfully', responseData);
    } catch (error) {
      console.error('Financial stats error:', error);
      sendError(res, 'Failed to retrieve financial statistics', 500, error.message);
    }
  })
);

module.exports = router;
