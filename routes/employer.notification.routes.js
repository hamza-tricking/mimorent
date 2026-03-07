const express = require('express');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const router = express.Router();
const Notification = require('../models/notification.model');
const auth = require('../middlewares/auth.middleware');

console.log('Employer notification routes loaded successfully');

// Get notifications for employer (all properties in his office's wilaya)
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get employer's office and wilaya
    const userId = req.user._id || req.user.id;
    console.log('Fetching notifications for employer:', userId);
    console.log('Employer officeId:', req.user.officeId);

    // Get employer's office to find wilaya
    const Office = require('../models/office.model');
    const employerOffice = await Office.findById(req.user.officeId);
    
    if (!employerOffice) {
      console.log('No office found for employer');
      return res.json({
        success: true,
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0
        }
      });
    }

    console.log('Employer office wilayaId:', employerOffice.wilayaId);

    // Get all properties in employer's office (not the entire wilaya)
    const Property = require('../models/property.model');
    const officeProperties = await Property.find({ 
      officeId: req.user.officeId 
    }).select('_id');
    
    const propertyIds = officeProperties.map(p => p._id);
    console.log('Properties in employer office:', propertyIds.length);

    // Fetch notifications related to properties in employer's office only
    // Filter for order and reminder notifications (not admin notifications)
    const notifications = await Notification.find({
      propertyId: { $in: propertyIds },
      type: { $in: ['order', 'reminders'] } // Show both order and reminder notifications to employers
    })
      .populate('reservationId', 'customerName customerPhone')
      .populate('propertyId', 'title wilayaId officeId')
      .populate('metadata.reminderId', 'message reminderType')
      .populate('seenBy', 'username firstName lastName name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments({
      propertyId: { $in: propertyIds },
      type: { $in: ['order', 'reminders'] } // Count both order and reminder notifications
    });

    console.log('Found notifications for employer office:', notifications.length);

    res.json({
      success: true,
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching employer notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
});

// Get unread notifications count for employer
router.get('/unread-count', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    
    // Get employer's office to find wilaya
    const Office = require('../models/office.model');
    const employerOffice = await Office.findById(req.user.officeId);
    
    if (!employerOffice) {
      return res.json({
        success: true,
        data: { unreadCount: 0 }
      });
    }

    // Get all properties in employer's office (not the entire wilaya)
    const Property = require('../models/property.model');
    const officeProperties = await Property.find({ 
      officeId: req.user.officeId 
    }).select('_id');
    
    const propertyIds = officeProperties.map(p => p._id);

    const unreadCount = await Notification.countDocuments({ 
      propertyId: { $in: propertyIds },
      read: false,
      type: { $in: ['order', 'reminders'] } // Count both order and reminder notifications
    });

    res.json({
      success: true,
      data: { unreadCount }
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count'
    });
  }
});

// Mark notification as seen
router.put('/:id/seen', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    
    // Get employer's office to find wilaya
    const Office = require('../models/office.model');
    const employerOffice = await Office.findById(req.user.officeId);
    
    if (!employerOffice) {
      return res.status(404).json({
        success: false,
        message: 'Employer office not found'
      });
    }

    // Get all properties in office's wilaya
    const Property = require('../models/property.model');
    const wilayaProperties = await Property.find({ 
      wilayaId: employerOffice.wilayaId 
    }).select('_id');
    
    const propertyIds = wilayaProperties.map(p => p._id);

    // First get the notification to check if user is already in seenBy
    const notification = await Notification.findOne({
      _id: req.params.id,
      propertyId: { $in: propertyIds }
    });
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or access denied'
      });
    }
    
    // Check if user is already in seenBy
    // Ensure seenBy is an array and filter out invalid ObjectIds
    if (!Array.isArray(notification.seenBy)) {
      notification.seenBy = [];
    } else {
      // Filter out any invalid ObjectIds from seenBy array
      notification.seenBy = notification.seenBy.filter(id => 
        id && ObjectId.isValid(id.toString())
      );
    }
    
    const alreadySeen = notification.seenBy.some(seenUserId => 
      seenUserId && seenUserId.toString() === userId.toString()
    );
    
    if (alreadySeen) {
      // User already seen this notification, just return it
      const populatedNotification = await Notification.findOne({
        _id: req.params.id,
        propertyId: { $in: propertyIds }
      })
        .populate('reservationId', 'customerName customerPhone')
        .populate('propertyId', 'title wilayaId')
        .populate('metadata.reminderId', 'message reminderType')
        .populate('seenBy', 'username firstName lastName name');
      
      return res.json({
        success: true,
        data: populatedNotification
      });
    }
    
    // Add user with full details to seenBy
    const fullName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.name || 'Unknown User';
    
    const updatedNotification = await Notification.findOneAndUpdate(
      { _id: req.params.id, propertyId: { $in: propertyIds } },
      { 
        $addToSet: { 
          seenBy: new ObjectId(userId)  // Create ObjectId
        }
      },
      { new: true }
    ).populate('reservationId', 'customerName customerPhone')
      .populate('propertyId', 'title wilayaId')
      .populate('metadata.reminderId', 'message reminderType')
      .populate('seenBy', 'username firstName lastName name');

    console.log('Employer marked notification as seen:', updatedNotification.seenBy);

    res.json({
      success: true,
      data: updatedNotification
    });
  } catch (error) {
    console.error('Error marking employer notification as seen:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as seen'
    });
  }
});

// Mark all notifications as seen
router.put('/seen-all', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    
    // Get employer's office to find wilaya
    const Office = require('../models/office.model');
    const employerOffice = await Office.findById(req.user.officeId);
    
    if (!employerOffice) {
      return res.json({
        success: true,
        data: { modifiedCount: 0 }
      });
    }

    // Get all properties in office's wilaya
    const Property = require('../models/property.model');
    const wilayaProperties = await Property.find({ 
      wilayaId: employerOffice.wilayaId 
    }).select('_id');
    
    const propertyIds = wilayaProperties.map(p => p._id);

    // Add user to seenBy for all notifications in the wilaya
    const fullName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.name || 'Unknown User';
    
    const result = await Notification.updateMany(
      { 
        propertyId: { $in: propertyIds },
        'seenBy': { $ne: new ObjectId(userId) } // Only update notifications where user hasn't seen them yet
      },
      { 
        $addToSet: { 
          seenBy: new ObjectId(userId)  // Create ObjectId
        }
      }
    );

    console.log('Employer marked all notifications as seen:', result.modifiedCount);

    res.json({
      success: true,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Error marking all employer notifications as seen:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as seen'
    });
  }
});

// Mark notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    
    // Get employer's office to find wilaya
    const Office = require('../models/office.model');
    const employerOffice = await Office.findById(req.user.officeId);
    
    if (!employerOffice) {
      return res.status(404).json({
        success: false,
        message: 'Employer office not found'
      });
    }

    // Get all properties in office's wilaya
    const Property = require('../models/property.model');
    const wilayaProperties = await Property.find({ 
      wilayaId: employerOffice.wilayaId 
    }).select('_id');
    
    const propertyIds = wilayaProperties.map(p => p._id);

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, propertyId: { $in: propertyIds } },
      { 
        read: true, 
        readAt: new Date() 
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or access denied'
      });
    }

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
});

// Mark all notifications as read for employer
router.put('/read-all', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    
    // Get employer's office to find wilaya
    const Office = require('../models/office.model');
    const employerOffice = await Office.findById(req.user.officeId);
    
    if (!employerOffice) {
      return res.json({
        success: true,
        data: { modifiedCount: 0 }
      });
    }

    // Get all properties in office's wilaya
    const Property = require('../models/property.model');
    const wilayaProperties = await Property.find({ 
      wilayaId: employerOffice.wilayaId 
    }).select('_id');
    
    const propertyIds = wilayaProperties.map(p => p._id);

    const result = await Notification.updateMany(
      { propertyId: { $in: propertyIds }, read: false },
      { 
        read: true, 
        readAt: new Date() 
      }
    );

    res.json({
      success: true,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read'
    });
  }
});

// Delete notification
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    
    // Get employer's office to find wilaya
    const Office = require('../models/office.model');
    const employerOffice = await Office.findById(req.user.officeId);
    
    if (!employerOffice) {
      return res.status(404).json({
        success: false,
        message: 'Employer office not found'
      });
    }

    // Get all properties in office's wilaya
    const Property = require('../models/property.model');
    const wilayaProperties = await Property.find({ 
      wilayaId: employerOffice.wilayaId 
    }).select('_id');
    
    const propertyIds = wilayaProperties.map(p => p._id);

    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      propertyId: { $in: propertyIds }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or access denied'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification'
    });
  }
});

module.exports = router;
