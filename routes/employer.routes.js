const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { employerOnly } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const Property = require('../models/property.model');
const Reservation = require('../models/reservation.model');
const History = require('../models/history.model');
const User = require('../models/user.model');
const Wilaya = require('../models/wilaya.model');
const Notification = require('../models/notification.model');
const mongoose = require('mongoose');

// GET /api/employer/wilaya/:wilayaId - Get wilaya info
router.get('/wilaya/:wilayaId',
  auth,
  employerOnly,
  asyncHandler(async (req, res) => {
    try {
      const { wilayaId } = req.params;
      
      const wilaya = await Wilaya.findById(wilayaId);
      if (!wilaya) {
        return sendError(res, 'Wilaya not found', 404);
      }

      sendSuccess(res, 'Wilaya retrieved successfully', { wilaya });
    } catch (error) {
      console.error('Get wilaya error:', error);
      sendError(res, 'Failed to retrieve wilaya', 500, error.message);
    }
  })
);

// GET /api/employer/properties/wilaya/:wilayaId - Get properties by wilaya
router.get('/properties/wilaya/:wilayaId',
  auth,
  employerOnly,
  asyncHandler(async (req, res) => {
    try {
      const { wilayaId } = req.params;
      
      const properties = await Property.find({ wilayaId })
        .populate('officeId', 'name')
        .populate('wilayaId', 'name')
        .sort({ createdAt: -1 });

      console.log('Employer properties API - Properties found:', properties.length); // Debug log
      properties.forEach((property, index) => {
        console.log(`Property ${index + 1}: ${property.title}, isReserved: ${property.isReserved}`); // Debug log
      });

      sendSuccess(res, 'Properties retrieved successfully', { properties });
    } catch (error) {
      console.error('Get properties by wilaya error:', error);
      sendError(res, 'Failed to retrieve properties', 500, error.message);
    }
  })
);

// PUT /api/employer/properties/:id - Update property status (for employers)
router.put('/properties/:id',
  auth,
  employerOnly,
  asyncHandler(async (req, res) => {
    try {
      const propertyId = req.params.id;
      const { available, isReserved } = req.body;

      console.log('🟢 BACKEND: Update request received:', { propertyId, available, isReserved }); // Debug log

      // Check if property exists
      const property = await Property.findById(propertyId);
      if (!property) {
        console.log('🔴 BACKEND: Property not found:', propertyId); // Debug log
        return sendError(res, 'Property not found', 404);
      }

      console.log('🟡 BACKEND: Property before update:', {
        id: property._id,
        title: property.title,
        available: property.available,
        isReserved: property.isReserved
      }); // Debug log

      // Build update object
      const updateData = {};
      if (available !== undefined) {
        updateData.available = available;
      }
      
      if (isReserved !== undefined) {
        updateData.isReserved = isReserved;
      }

      console.log('🟡 BACKEND: Update data to apply:', updateData); // Debug log

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
        
        console.log('🟢 BACKEND: Property updated successfully:', {
          id: updatedProperty._id,
          title: updatedProperty.title,
          available: updatedProperty.available,
          isReserved: updatedProperty.isReserved
        }); // Debug log

        sendSuccess(res, 'Property updated successfully', { property: updatedProperty });
        return;
      }

      // If no update needed, return original property
      console.log('🟡 BACKEND: No update needed, returning original property'); // Debug log
      sendSuccess(res, 'Property updated successfully', { property });
    } catch (error) {
      console.error('🔴 BACKEND: Update property error:', error);
      sendError(res, 'Failed to update property', 500, error.message);
    }
  })
);

// GET /api/employer/reservations/employer/:employerId - Get reservations by employer
router.get('/reservations/employer/:employerId',
  auth,
  employerOnly,
  asyncHandler(async (req, res) => {
    try {
      const { employerId } = req.params;
      
      // Get all reservations (employers can see all reservations regardless of who created them)
      const reservations = await Reservation.find({})
        .populate('propertyId', 'title description pricePerDay')
        .sort({ createdAt: -1 });

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

      // Create notification for new reservation
      try {
        await Notification.create({
          type: 'reservation',
          title: 'حجز جديد',
          message: `تم إنشاء حجز جديد للعميل ${customerName} للعقار ${property.title}`,
          reservationId: reservation._id,
          propertyId: propertyId,
          userId: req.user._id,
          metadata: {
            customerName: customerName,
            propertyTitle: property.title,
            customerPhone: customerPhone,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            totalPrice: totalPrice,
            paymentStatus: paymentStatus || 'pending',
            employerId: employerId
          }
        });
        console.log('🔔 Notification created for employer reservation:', reservation._id);
      } catch (notificationError) {
        console.error('Failed to create notification:', notificationError);
        // Continue with reservation creation even if notification fails
      }

      // Update property to mark as reserved
      await Property.findByIdAndUpdate(
        propertyId,
        { isReserved: true },
        { new: true }
      );

      console.log('🟢 BACKEND: Reservation created and property marked as reserved:', {
        reservationId: reservation._id,
        propertyId: propertyId,
        propertyTitle: property.title
      });

      // Log history entry for reservation creation
      try {
        await History.createReservationHistory({
          action: 'reservation_created',
          reservationId: reservation._id,
          userId: req.user._id,
          description: `تم إنشاء حجز جديد للعميل ${customerName} للعقار ${property.title}`,
          metadata: {
            customerName,
            customerPhone,
            startDate,
            endDate,
            totalPrice,
            paidAmount,
            remainingAmount,
            paymentStatus: reservation.paymentStatus,
            status: reservation.status,
            propertyTitle: property.title,
            propertyId: property._id,
            propertyPricePerDay: property.pricePerDay,
            employerId: employerId,
            createdAt: reservation.createdAt,
            reservationId: reservation._id
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
        console.log('🟢 BACKEND: History entry created for employer reservation');
      } catch (historyError) {
        console.error('Failed to create history entry:', historyError);
        // Don't fail the request if history logging fails
      }

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

      // Check if reservation exists
      const reservation = await Reservation.findById(reservationId);
      if (!reservation) {
        return sendError(res, 'Reservation not found', 404);
      }

      // Update reservation (employers can edit any reservation)
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
