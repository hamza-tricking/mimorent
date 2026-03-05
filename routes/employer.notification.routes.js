const express = require('express');
const router = express.Router();
const Notification = require('../models/notification.model');
const auth = require('../middlewares/auth.middleware');

console.log('Employer notification routes loaded successfully');

// Get notifications for employer (only their wilaya properties)
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get employer's wilaya
    const userId = req.user._id || req.user.id;
    console.log('Fetching notifications for employer:', userId);
    console.log('Employer wilaya:', req.user.wilayaId);

    // Get employer's properties to filter notifications
    const Property = require('../models/property.model');
    const employerProperties = await Property.find({ 
      createdBy: userId,
      wilayaId: req.user.wilayaId 
    }).select('_id');
    
    const propertyIds = employerProperties.map(p => p._id);
    console.log('Employer property IDs:', propertyIds);

    // Fetch notifications related to employer's properties
    const notifications = await Notification.find({
      propertyId: { $in: propertyIds }
    })
      .populate('reservationId', 'customerName customerPhone')
      .populate('propertyId', 'title wilayaId')
      .populate('metadata.reminderId', 'message reminderType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments({
      propertyId: { $in: propertyIds }
    });

    console.log('Found employer notifications:', notifications.length);

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
    
    // Get employer's properties
    const Property = require('../models/property.model');
    const employerProperties = await Property.find({ 
      createdBy: userId,
      wilayaId: req.user.wilayaId 
    }).select('_id');
    
    const propertyIds = employerProperties.map(p => p._id);

    const unreadCount = await Notification.countDocuments({ 
      propertyId: { $in: propertyIds },
      read: false 
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

// Mark notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    
    // Verify notification belongs to employer's property
    const Property = require('../models/property.model');
    const employerProperties = await Property.find({ 
      createdBy: userId,
      wilayaId: req.user.wilayaId 
    }).select('_id');
    
    const propertyIds = employerProperties.map(p => p._id);

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
    
    // Get employer's properties
    const Property = require('../models/property.model');
    const employerProperties = await Property.find({ 
      createdBy: userId,
      wilayaId: req.user.wilayaId 
    }).select('_id');
    
    const propertyIds = employerProperties.map(p => p._id);

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
    
    // Verify notification belongs to employer's property
    const Property = require('../models/property.model');
    const employerProperties = await Property.find({ 
      createdBy: userId,
      wilayaId: req.user.wilayaId 
    }).select('_id');
    
    const propertyIds = employerProperties.map(p => p._id);

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
