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
      
      // Get current reservation data before updating if making property available
      let currentReservation = null;
      if (isReserved === false && property.reservationId) {
        currentReservation = await Property.findById(property._id)
          .populate('reservationId', 'customerName customerPhone status startDate endDate totalPrice paidAmount remainingAmount paymentStatus');
      }
      
      if (isReserved !== undefined) {
        updateData.isReserved = isReserved;
        // If making property available, clear the reservationId
        if (isReserved === false) {
          updateData.reservationId = null;
        }
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

        // Create notification and history when property is made available
        if (isReserved === false) {
          try {
            const Notification = require('../models/notification.model');
            const User = require('../models/user.model');
            const History = require('../models/history.model');
            
            // Fetch user data to get proper name
            const userData = await User.findById(req.user._id);
            const creatorName = userData?.firstName && userData?.lastName 
              ? `${userData.firstName} ${userData.lastName}` 
              : userData?.username || userData?.name || 'System';

            // Create notification
            const notificationData = {
              type: 'property',
              title: 'العقار أصبح متاحاً',
              message: `تم جعل العقار "${updatedProperty.title}" متاحاً للحجز`,
              propertyId: updatedProperty._id,
              userId: req.user._id,
              metadata: {
                propertyTitle: updatedProperty.title,
                propertyId: updatedProperty._id,
                action: 'made_available',
                createdById: req.user._id,
                createdByName: creatorName,
                createdAt: new Date(),
                // Add current reservation details if available
                ...(currentReservation?.reservationId && {
                  customerName: currentReservation.reservationId.customerName,
                  customerPhone: currentReservation.reservationId.customerPhone,
                  startDate: currentReservation.reservationId.startDate,
                  endDate: currentReservation.reservationId.endDate,
                  totalPrice: currentReservation.reservationId.totalPrice,
                  paidAmount: currentReservation.reservationId.paidAmount || 0,
                  remainingAmount: currentReservation.reservationId.remainingAmount || currentReservation.reservationId.totalPrice,
                  paymentStatus: currentReservation.reservationId.paymentStatus || 'pending',
                  status: currentReservation.reservationId.status,
                  // Also keep previous reservation for reference
                  previousReservation: {
                    customerName: currentReservation.reservationId.customerName,
                    customerPhone: currentReservation.reservationId.customerPhone,
                    status: currentReservation.reservationId.status,
                    startDate: currentReservation.reservationId.startDate,
                    endDate: currentReservation.reservationId.endDate,
                    totalPrice: currentReservation.reservationId.totalPrice
                  }
                })
              }
            };
            
            await Notification.create(notificationData);
            console.log('🔔 Notification created for property availability:', updatedProperty._id);

            // Create history record
            const historyData = {
              action: 'property_updated',
              entityType: 'property',
              entityId: updatedProperty._id,
              userId: req.user._id,
              description: `تم جعل العقار "${updatedProperty.title}" متاحاً للحجز`,
              metadata: {
                propertyTitle: updatedProperty.title,
                propertyId: updatedProperty._id,
                action: 'made_available',
                previousStatus: 'reserved',
                newStatus: 'available',
                createdById: req.user._id,
                createdByName: creatorName,
                createdAt: new Date(),
                // Add current reservation details if available
                ...(currentReservation?.reservationId && {
                  customerName: currentReservation.reservationId.customerName,
                  customerPhone: currentReservation.reservationId.customerPhone,
                  startDate: currentReservation.reservationId.startDate,
                  endDate: currentReservation.reservationId.endDate,
                  totalPrice: currentReservation.reservationId.totalPrice,
                  paidAmount: currentReservation.reservationId.paidAmount || 0,
                  remainingAmount: currentReservation.reservationId.remainingAmount || currentReservation.reservationId.totalPrice,
                  paymentStatus: currentReservation.reservationId.paymentStatus || 'pending',
                  status: currentReservation.reservationId.status,
                  // Also keep previous reservation for reference
                  previousReservation: {
                    customerName: currentReservation.reservationId.customerName,
                    customerPhone: currentReservation.reservationId.customerPhone,
                    status: currentReservation.reservationId.status,
                    startDate: currentReservation.reservationId.startDate,
                    endDate: currentReservation.reservationId.endDate,
                    totalPrice: currentReservation.reservationId.totalPrice
                  }
                })
              },
              ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
            };

            await History.create(historyData);
            console.log('📝 History record created for property availability:', updatedProperty._id);

          } catch (notificationError) {
            console.error('Failed to create notification/history:', notificationError);
            // Continue with property update even if notification fails
          }
        }

        sendSuccess(res, 'Property updated successfully', { property: updatedProperty });
        return;
      }

      // If no update needed, return original property
      console.log('🟡 BACKEND: No update needed, returning original property'); // Debug log
      sendSuccess(res, 'Property updated successfully', { property });
    } catch (error) {
      console.error('Get reservations error:', error);
      sendError(res, 'Failed to retrieve reservations', 500, error.message);
    }
  })
);

// GET /api/employer/reservations - Get reservations for current employer
router.get('/reservations',
  auth,
  employerOnly,
  asyncHandler(async (req, res) => {
    try {
      // Get employer's office and wilaya
      const Office = require('../models/office.model');
      const employerOffice = await Office.findById(req.user.officeId);
      
      if (!employerOffice) {
        return sendError(res, 'Employer office not found', 404);
      }

      // Get all properties in employer's office
      const Property = require('../models/property.model');
      const officeProperties = await Property.find({ 
        officeId: req.user.officeId 
      }).select('_id');
      
      const propertyIds = officeProperties.map(p => p._id);

      // Get reservations for properties in employer's office
      const reservations = await Reservation.find({
        propertyId: { $in: propertyIds }
      })
        .populate('propertyId', 'title description pricePerDay images')
        .sort({ createdAt: -1 });

      console.log('🟢 Found reservations for employer office:', reservations.length);

      sendSuccess(res, 'Reservations retrieved successfully', { reservations });
    } catch (error) {
      console.error('Get reservations error:', error);
      sendError(res, 'Failed to retrieve reservations', 500, error.message);
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

      // Create notification and history for new reservation
      try {
        // Fetch user data to get proper name
        const userData = await User.findById(req.user._id);
        const creatorName = userData?.firstName && userData?.lastName 
          ? `${userData.firstName} ${userData.lastName}` 
          : userData?.username || userData?.name || 'System';
        
        // Create notification
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
            paidAmount: paidAmount,
            remainingAmount: remainingAmount,
            paymentStatus: paymentStatus || 'pending',
            status: 'pending',
            employerId: employerId,
            createdById: req.user._id,
            createdByName: creatorName,
            createdAt: new Date()
          }
        });
        console.log('🔔 Notification created for employer reservation:', reservation._id);

        // Create history record
        const History = require('../models/history.model');
        await History.create({
          action: 'reservation_created',
          entityType: 'reservation',
          entityId: reservation._id,
          userId: req.user._id,
          description: `تم إنشاء حجز جديد للعميل ${customerName} للعقار ${property.title}`,
          metadata: {
            customerName: customerName,
            propertyTitle: property.title,
            customerPhone: customerPhone,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            totalPrice: totalPrice,
            paidAmount: paidAmount,
            remainingAmount: remainingAmount,
            paymentStatus: paymentStatus || 'pending',
            status: 'pending',
            employerId: employerId,
            createdById: req.user._id,
            createdByName: creatorName,
            createdAt: new Date()
          },
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
        });
        console.log('📝 History record created for employer reservation:', reservation._id);
      } catch (notificationError) {
        console.error('Failed to create notification/history:', notificationError);
        // Continue with reservation creation even if notification fails
      }

      // Update property to mark as reserved and link reservation
      await Property.findByIdAndUpdate(
        propertyId,
        { 
          isReserved: true,
          reservationId: reservation._id
        },
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

      // Create notification and history for reservation update
      try {
        const updatedProperty = await Property.findById(reservation.propertyId);
        
        // Fetch user data to get proper name
        const userData = await User.findById(req.user._id);
        const creatorName = userData?.firstName && userData?.lastName 
          ? `${userData.firstName} ${userData.lastName}` 
          : userData?.username || userData?.name || 'System';
        
        // Create notification
        await Notification.create({
          type: 'reservation',
          title: 'تم تحديث الحجز',
          message: `تم تحديث حجز العميل ${reservation.customerName} للعقار ${updatedProperty?.title || 'Unknown'}`,
          reservationId: reservation._id,
          propertyId: reservation.propertyId,
          userId: req.user._id,
          metadata: {
            customerName: reservation.customerName,
            propertyTitle: updatedProperty?.title || 'Unknown',
            customerPhone: reservation.customerPhone,
            startDate: reservation.startDate,
            endDate: reservation.endDate,
            totalPrice: reservation.totalPrice,
            paymentStatus: reservation.paymentStatus,
            status: reservation.status,
            paidAmount: reservation.paidAmount,
            remainingAmount: reservation.remainingAmount,
            employerId: reservation.employerId,
            createdById: req.user._id,
            createdByName: creatorName,
            createdAt: new Date(),
            action: 'updated',
            changes: {
              customerName: customerName !== undefined,
              customerPhone: customerPhone !== undefined,
              startDate: startDate !== undefined,
              endDate: endDate !== undefined,
              totalPrice: totalPrice !== undefined,
              paidAmount: paidAmount !== undefined,
              remainingAmount: remainingAmount !== undefined,
              paymentStatus: paymentStatus !== undefined,
              status: status !== undefined
            }
          }
        });
        console.log('🔔 Notification created for employer reservation update:', reservation._id);

        // Create history record
        const History = require('../models/history.model');
        await History.create({
          action: 'reservation_updated',
          entityType: 'reservation',
          entityId: reservation._id,
          userId: req.user._id,
          description: `تم تحديث حجز العميل ${reservation.customerName} للعقار ${updatedProperty?.title || 'Unknown'}`,
          metadata: {
            customerName: reservation.customerName,
            propertyTitle: updatedProperty?.title || 'Unknown',
            customerPhone: reservation.customerPhone,
            startDate: reservation.startDate,
            endDate: reservation.endDate,
            totalPrice: reservation.totalPrice,
            paymentStatus: reservation.paymentStatus,
            status: reservation.status,
            paidAmount: reservation.paidAmount,
            remainingAmount: reservation.remainingAmount,
            employerId: reservation.employerId,
            createdById: req.user._id,
            createdByName: creatorName,
            createdAt: new Date(),
            action: 'updated',
            changes: {
              customerName: customerName !== undefined,
              customerPhone: customerPhone !== undefined,
              startDate: startDate !== undefined,
              endDate: endDate !== undefined,
              totalPrice: totalPrice !== undefined,
              paidAmount: paidAmount !== undefined,
              remainingAmount: remainingAmount !== undefined,
              paymentStatus: paymentStatus !== undefined,
              status: status !== undefined
            }
          },
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
        });
        console.log('📝 History record created for employer reservation update:', reservation._id);
      } catch (notificationError) {
        console.error('Failed to create notification/history:', notificationError);
        // Continue with reservation update even if notification fails
      }

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
