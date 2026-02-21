const express = require('express');
const router = express.Router();
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const Property = require('../models/property.model');
const Wilaya = require('../models/wilaya.model');
const Reservation = require('../models/reservation.model');

// GET /api/properties - Get all available properties (public)
router.get('/properties',
  asyncHandler(async (req, res) => {
    try {
      console.log('Public properties API called');

      // Get available properties (available: true, regardless of isReserved)
      const properties = await Property.find({ available: true })
        .populate('wilayaId', 'name')
        .populate('officeId', 'name')
        .sort({ createdAt: -1 });

      console.log('Available properties found:', properties.length);

      // Add reservation end date for reserved properties
      const propertiesWithReservationInfo = await Promise.all(
        properties.map(async (property) => {
          const propertyObj = property.toObject();
          
          if (property.isReserved) {
            // Get the most recent active reservation for this property
            const activeReservation = await Reservation.findOne({
              propertyId: property._id,
              status: { $in: ['pending', 'confirmed'] }
            }).sort({ endDate: -1 }).select('endDate');
            
            if (activeReservation) {
              propertyObj.reservationEndDate = activeReservation.endDate;
            }
          }
          
          return propertyObj;
        })
      );

      sendSuccess(res, 'Properties retrieved successfully', {
        properties: propertiesWithReservationInfo
      });
    } catch (error) {
      console.error('Get public properties error:', error);
      sendError(res, 'Failed to retrieve properties', 500, error.message);
    }
  })
);

// GET /api/wilayas - Get all wilayas (public)
router.get('/wilayas',
  asyncHandler(async (req, res) => {
    try {
      const wilayas = await Wilaya.find()
        .sort({ name: 1 });

      sendSuccess(res, 'Wilayas retrieved successfully', { wilayas });
    } catch (error) {
      console.error('Get wilayas error:', error);
      sendError(res, 'Failed to retrieve wilayas', 500, error.message);
    }
  })
);

// GET /api/properties/:id - Get single property by ID (public)
router.get('/properties/:id',
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      const property = await Property.findById(id)
        .populate('wilayaId', 'name')
        .populate('officeId', 'name');

      if (!property) {
        return sendError(res, 'Property not found', 404);
      }

      // Only show available and not reserved properties
      if (!property.available || property.isReserved) {
        return sendError(res, 'Property not available', 404);
      }

      sendSuccess(res, 'Property retrieved successfully', { property });
    } catch (error) {
      console.error('Get public property error:', error);
      sendError(res, 'Failed to retrieve property', 500, error.message);
    }
  })
);

module.exports = router;
