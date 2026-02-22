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
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      
      console.log('🟢 Date ranges:');
      console.log('  Today:', today, 'to', tomorrow);
      console.log('  Week:', weekStart, 'to', weekEnd);
      console.log('  Month:', monthStart, 'to', monthEnd);
      
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
        console.log(`🟢 ${rangeName} date range: ${startDate} to ${endDate}`);
        
        // Get overall stats (all reservations)
        const overallStats = await Reservation.aggregate([
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
        
        console.log(`🟢 ${rangeName} overall stats:`, overallStats);
        console.log(`🟢 ${rangeName} found ${overallStats[0]?.reservationCount || 0} reservations`);
        
        // Get completed reservations stats (for actual revenue)
        const completedMatchQuery = { ...matchQuery, status: 'completed' };
        const completedStats = await Reservation.aggregate([
          { $match: completedMatchQuery },
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
              completedRevenue: { $sum: '$totalPrice' },
              completedPaid: { $sum: '$paidAmount' },
              completedPending: { $sum: '$remainingAmount' },
              completedCount: { $sum: 1 }
            }
          }
        ]);
        
        console.log(`🟢 ${rangeName} completed stats:`, completedStats);
        console.log(`🟢 ${rangeName} found ${completedStats[0]?.completedCount || 0} completed reservations`);
        
        // Get breakdown by status
        const statusBreakdown = await Reservation.aggregate([
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
              _id: '$status',
              count: { $sum: 1 },
              totalRevenue: { $sum: '$totalPrice' },
              totalPaid: { $sum: '$paidAmount' }
            }
          }
        ]);
        
        const overall = overallStats[0] || {
          totalRevenue: 0,
          totalPaid: 0,
          totalPending: 0,
          reservationCount: 0
        };
        
        const completed = completedStats[0] || {
          completedRevenue: 0,
          completedPaid: 0,
          completedPending: 0,
          completedCount: 0
        };
        
        // Format status breakdown
        const statusStats = {
          pending: { count: 0, revenue: 0, paid: 0 },
          confirmed: { count: 0, revenue: 0, paid: 0 },
          cancelled: { count: 0, revenue: 0, paid: 0 },
          completed: { count: 0, revenue: 0, paid: 0 }
        };
        
        statusBreakdown.forEach(item => {
          if (statusStats[item._id]) {
            statusStats[item._id] = {
              count: item.count,
              revenue: item.totalRevenue,
              paid: item.totalPaid
            };
          }
        });
        
        const result = {
          ...overall,
          ...completed,
          statusBreakdown: statusStats
        };
        
        console.log(`🟢 ${rangeName} comprehensive stats:`, result);
        return result;
      };
      
      // Get stats for different periods
      const dailyStats = await getStatsForDateRange(today, tomorrow, 'Daily');
      const weeklyStats = await getStatsForDateRange(weekStart, weekEnd, 'Weekly');
      const monthlyStats = await getStatsForDateRange(monthStart, monthEnd, 'Monthly');
      
      // Get all time stats (no date filter)
      const allTimeStats = await getStatsForDateRange(new Date(0), new Date(), 'All Time');
      
      // Get stats by wilaya (comprehensive)
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
            _id: {
              wilayaId: '$property.wilayaId',
              status: '$status'
            },
            wilayaName: { $first: '$wilaya.name' },
            count: { $sum: 1 },
            totalRevenue: { $sum: '$totalPrice' },
            totalPaid: { $sum: '$paidAmount' },
            completedRevenue: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, '$totalPrice', 0]
              }
            }
          }
        },
        {
          $group: {
            _id: '$_id.wilayaId',
            wilayaName: { $first: '$wilayaName' },
            totalRevenue: { $sum: '$totalRevenue' },
            totalPaid: { $sum: '$totalPaid' },
            totalPending: { $sum: { $subtract: ['$totalRevenue', '$totalPaid'] } },
            reservationCount: { $sum: '$count' },
            completedRevenue: { $sum: '$completedRevenue' },
            statusBreakdown: {
              $push: {
                status: '$_id.status',
                count: '$count',
                revenue: '$totalRevenue',
                paid: '$totalPaid'
              }
            }
          }
        },
        { $sort: { completedRevenue: -1 } }
      ]);
      
      // Get stats by office (comprehensive)
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
            _id: {
              officeId: '$property.officeId',
              status: '$status'
            },
            officeName: { $first: '$office.name' },
            count: { $sum: 1 },
            totalRevenue: { $sum: '$totalPrice' },
            totalPaid: { $sum: '$paidAmount' },
            completedRevenue: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, '$totalPrice', 0]
              }
            }
          }
        },
        {
          $group: {
            _id: '$_id.officeId',
            officeName: { $first: '$officeName' },
            totalRevenue: { $sum: '$totalRevenue' },
            totalPaid: { $sum: '$totalPaid' },
            totalPending: { $sum: { $subtract: ['$totalRevenue', '$totalPaid'] } },
            reservationCount: { $sum: '$count' },
            completedRevenue: { $sum: '$completedRevenue' },
            statusBreakdown: {
              $push: {
                status: '$_id.status',
                count: '$count',
                revenue: '$totalRevenue',
                paid: '$totalPaid'
              }
            }
          }
        },
        { $sort: { completedRevenue: -1 } }
      ]);
      
      // Get stats by employer (comprehensive)
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
          $group: {
            _id: {
              employerId: '$employerId',
              status: '$status'
            },
            count: { $sum: 1 },
            totalRevenue: { $sum: '$totalPrice' },
            totalPaid: { $sum: '$paidAmount' },
            completedRevenue: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, '$totalPrice', 0]
              }
            }
          }
        },
        {
          $group: {
            _id: '$_id.employerId',
            totalRevenue: { $sum: '$totalRevenue' },
            totalPaid: { $sum: '$totalPaid' },
            totalPending: { $sum: { $subtract: ['$totalRevenue', '$totalPaid'] } },
            reservationCount: { $sum: '$count' },
            completedRevenue: { $sum: '$completedRevenue' },
            statusBreakdown: {
              $push: {
                status: '$_id.status',
                count: '$count',
                revenue: '$totalRevenue',
                paid: '$totalPaid'
              }
            }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'employer'
          }
        },
        { $unwind: { path: '$employer', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            employerName: { 
              $cond: {
                if: { $ne: ['$employer', null] },
                then: { $concat: ['$employer.firstName', ' ', '$employer.lastName'] },
                else: 'Unknown Employer'
              }
            }
          }
        },
        { $sort: { completedRevenue: -1 } }
      ]);
      
      const responseData = {
        all: allTimeStats,
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
