const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const Reservation = require('../models/reservation.model');
const User = require('../models/user.model');
const Office = require('../models/office.model');
const Wilaya = require('../models/wilaya.model');

// GET /api/admin/financial-stats - Get financial statistics
router.get('/financial-stats',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const { wilayaId, officeId, employerId } = req.query;
      
      // First, let's check if we have any reservations at all
      const totalReservations = await Reservation.countDocuments();
      console.log('🟢 Total reservations in DB:', totalReservations);
      
      if (totalReservations === 0) {
        // Return empty stats if no reservations exist
        const emptyStats = {
          daily: { totalRevenue: 0, totalPaid: 0, totalPending: 0, reservationCount: 0 },
          weekly: { totalRevenue: 0, totalPaid: 0, totalPending: 0, reservationCount: 0 },
          monthly: { totalRevenue: 0, totalPaid: 0, totalPending: 0, reservationCount: 0 },
          byWilaya: [],
          byOffice: [],
          byEmployer: []
        };
        return sendSuccess(res, 'No reservations found', emptyStats);
      }
      
      // Get current date ranges
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      console.log('🟢 Date ranges - Today:', today, 'Week Start:', weekStart, 'Month Start:', monthStart);
      
      // Helper function to get stats for a date range
      const getStatsForDateRange = async (startDate, endDate, rangeName) => {
        const matchQuery = {
          createdAt: {
            $gte: startDate,
            $lt: endDate
          }
        };
        
        // Add filters if provided
        if (employerId) matchQuery.employerId = new mongoose.Types.ObjectId(employerId);
        
        console.log(`🟢 ${rangeName} query:`, matchQuery);
        
        const stats = await Reservation.aggregate([
          { $match: matchQuery },
          {
            $lookup: {
              from: 'properties',
              localField: 'propertyId',
              foreignField: '_id',
              as: 'property'
            }
          },
          { $unwind: '$property' },
          // Add property-based filters
          ...(wilayaId ? [{ $match: { 'property.wilayaId': new mongoose.Types.ObjectId(wilayaId) } }] : []),
          ...(officeId ? [{ $match: { 'property.officeId': new mongoose.Types.ObjectId(officeId) } }] : []),
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
        
        const result = stats[0] || {
          totalRevenue: 0,
          totalPaid: 0,
          totalPending: 0,
          reservationCount: 0
        };
        
        console.log(`🟢 ${rangeName} stats:`, result);
        return result;
      };
      
      // Get stats for different periods
      const dailyStats = await getStatsForDateRange(today, new Date(today.getTime() + 24 * 60 * 60 * 1000), 'Daily');
      const weeklyStats = await getStatsForDateRange(weekStart, new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000), 'Weekly');
      const monthlyStats = await getStatsForDateRange(monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1), 'Monthly');
      
      // Get stats by wilaya
      const wilayaStats = await Reservation.aggregate([
        // Apply filters at the beginning
        ...(employerId ? [{ $match: { employerId: new mongoose.Types.ObjectId(employerId) } }] : []),
        {
          $lookup: {
            from: 'properties',
            localField: 'propertyId',
            foreignField: '_id',
            as: 'property'
          }
        },
        { $unwind: '$property' },
        // Apply property-based filters after lookup
        ...(officeId ? [{ $match: { 'property.officeId': new mongoose.Types.ObjectId(officeId) } }] : []),
        // If wilayaId is provided, only return that specific wilaya
        ...(wilayaId ? [{ $match: { 'property.wilayaId': new mongoose.Types.ObjectId(wilayaId) } }] : []),
        {
          $lookup: {
            from: 'wilayas',
            localField: 'property.wilayaId',
            foreignField: '_id',
            as: 'wilaya'
          }
        },
        { $unwind: '$wilaya' },
        {
          $group: {
            _id: '$property.wilayaId',
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
        // Apply filters at the beginning
        ...(employerId ? [{ $match: { employerId: new mongoose.Types.ObjectId(employerId) } }] : []),
        {
          $lookup: {
            from: 'properties',
            localField: 'propertyId',
            foreignField: '_id',
            as: 'property'
          }
        },
        { $unwind: '$property' },
        // Apply property-based filters after lookup
        ...(wilayaId ? [{ $match: { 'property.wilayaId': new mongoose.Types.ObjectId(wilayaId) } }] : []),
        // If officeId is provided, only return that specific office
        ...(officeId ? [{ $match: { 'property.officeId': new mongoose.Types.ObjectId(officeId) } }] : []),
        {
          $lookup: {
            from: 'offices',
            localField: 'property.officeId',
            foreignField: '_id',
            as: 'office'
          }
        },
        { $unwind: '$office' },
        {
          $group: {
            _id: '$property.officeId',
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
        {
          $lookup: {
            from: 'properties',
            localField: 'propertyId',
            foreignField: '_id',
            as: 'property'
          }
        },
        { $unwind: '$property' },
        // Apply property-based filters after lookup
        ...(wilayaId ? [{ $match: { 'property.wilayaId': new mongoose.Types.ObjectId(wilayaId) } }] : []),
        ...(officeId ? [{ $match: { 'property.officeId': new mongoose.Types.ObjectId(officeId) } }] : []),
        // If employerId is provided, only return that specific employer
        ...(employerId ? [{ $match: { employerId: new mongoose.Types.ObjectId(employerId) } }] : []),
        {
          $lookup: {
            from: 'users',
            localField: 'employerId',
            foreignField: '_id',
            as: 'employer'
          }
        },
        { $unwind: { path: '$employer', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$employerId',
            employerName: { 
              $first: { 
                $cond: {
                  if: { $ne: ['$employer', null] },
                  then: { $concat: ['$employer.firstName', ' ', '$employer.lastName'] },
                  else: 'Unknown Employer'
                }
              }
            },
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
      
      console.log('🟢 BACKEND: Final financial stats response:', responseData);
      
      sendSuccess(res, 'Financial statistics retrieved successfully', responseData);
    } catch (error) {
      console.error('Financial stats error:', error);
      sendError(res, 'Failed to retrieve financial statistics', 500, error.message);
    }
  })
);

module.exports = router;
