const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { employerOnly } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const Property = require('../models/property.model');
const Reservation = require('../models/reservation.model');
const User = require('../models/user.model');

// GET /api/properties/wilaya/:wilayaId - Get properties by wilaya
router.get('/wilaya/:wilayaId',
  auth,
  employerOnly,
  asyncHandler(async (req, res) => {
    try {
      const { wilayaId } = req.params;
      
      const properties = await Property.find({ wilayaId })
        .populate('officeId', 'name')
        .populate('wilayaId', 'name')
        .sort({ createdAt: -1 });

      sendSuccess(res, 'Properties retrieved successfully', { properties });
    } catch (error) {
      console.error('Get properties by wilaya error:', error);
      sendError(res, 'Failed to retrieve properties', 500, error.message);
    }
  })
);

// GET /api/reservations/employer/:employerId - Get reservations by employer
router.get('/reservations/employer/:employerId',
  auth,
  employerOnly,
  asyncHandler(async (req, res) => {
    try {
      const { employerId } = req.params;
      
      console.log('=== BACKEND DEBUG ===');
      console.log('Fetching ALL reservations for employer:', employerId);
      
      // Get all reservations (employers can see all reservations regardless of who created them)
      const reservations = await Reservation.find({})
        .populate('propertyId', 'title description pricePerDay')
        .sort({ createdAt: -1 });
      
      console.log('Total reservations found:', reservations.length);
      console.log('Reservations:', reservations.map(r => ({
        reservationId: r._id,
        customerName: r.customerName,
        propertyTitle: r.propertyId?.title,
        paidAmount: r.paidAmount,
        remainingAmount: r.remainingAmount
      })));
      console.log('=== END BACKEND DEBUG ===');

      sendSuccess(res, 'Reservations retrieved successfully', { reservations });
    } catch (error) {
      console.error('Get reservations by employer error:', error);
      sendError(res, 'Failed to retrieve reservations', 500, error.message);
    }
  })
);

// POST /api/reservations - Create new reservation (for employers)
router.post('/reservations',
  auth,
  employerOnly,
  asyncHandler(async (req, res) => {
    try {
      const { 
        propertyId, 
        customerName, 
        customerPhone, 
        startDate, 
        endDate, 
        totalPrice, 
        paidAmount,
        remainingAmount,
        paymentStatus,
        employerId 
      } = req.body;

      // Check if property exists and is available
      const property = await Property.findById(propertyId);
      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      if (!property.available) {
        return sendError(res, 'Property is not available for reservation', 400);
      }

      // Create reservation
      const reservation = new Reservation({
        propertyId,
        employerId,
        customerName,
        customerPhone,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice,
        paidAmount,
        remainingAmount,
        paymentStatus: paymentStatus || 'pending',
        status: 'pending'
      });

      await reservation.save();

      sendSuccess(res, 'Reservation created successfully', { reservation }, 201);
    } catch (error) {
      console.error('Reservation creation error:', error);
      if (error.name === 'ValidationError') {
        return sendError(res, 'Validation failed', 400, error.message);
      }
      sendError(res, 'Failed to create reservation', 500, error.message);
    }
  })
);

// PUT /api/reservations/:id - Update reservation (for employers)
router.put('/reservations/:id',
  auth,
  employerOnly,
  asyncHandler(async (req, res) => {
    try {
      const { 
        customerName, 
        customerPhone, 
        startDate, 
        endDate, 
        totalPrice, 
        paidAmount,
        remainingAmount,
        paymentStatus,
        status 
      } = req.body;
      const reservationId = req.params.id;
      const employerId = req.user.id;

      // Check if reservation exists
      const reservation = await Reservation.findById(reservationId);
      if (!reservation) {
        return sendError(res, 'Reservation not found', 404);
      }

      // Check if this reservation belongs to the employer or their office
      const employer = await User.findById(employerId);
      const officeProperties = await Property.find({ officeId: employer.officeId }).select('_id');
      const propertyIds = officeProperties.map(p => p._id);

      if (reservation.employerId.toString() !== employerId && 
          !propertyIds.some(id => id.toString() === reservation.propertyId.toString())) {
        return sendError(res, 'Access denied', 403);
      }

      // Update reservation
      if (customerName) reservation.customerName = customerName;
      if (customerPhone) reservation.customerPhone = customerPhone;
      if (startDate) reservation.startDate = new Date(startDate);
      if (endDate) reservation.endDate = new Date(endDate);
      if (totalPrice) reservation.totalPrice = totalPrice;
      if (paidAmount !== undefined) reservation.paidAmount = paidAmount;
      if (remainingAmount !== undefined) reservation.remainingAmount = remainingAmount;
      if (paymentStatus) reservation.paymentStatus = paymentStatus;
      if (status) reservation.status = status;

      await reservation.save();

      sendSuccess(res, 'Reservation updated successfully', { reservation });
    } catch (error) {
      console.error('Reservation update error:', error);
      if (error.name === 'ValidationError') {
        return sendError(res, 'Validation failed', 400, error.message);
      }
      sendError(res, 'Failed to update reservation', 500, error.message);
    }
  })
);

module.exports = router;
