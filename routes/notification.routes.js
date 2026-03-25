const express = require('express');
const router = express.Router();
const Notification = require('../models/notification.model');
const auth = require('../middlewares/auth.middleware');
const mongoose = require('mongoose');

console.log('Notification routes loaded successfully');

// Get all notifications for the logged-in admin
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // For admin users, show all notifications from the system
    // For regular users, show only their notifications
    const userId = req.user._id || req.user.id;
    console.log('Fetching notifications for user:', userId);
    console.log('Full user object:', JSON.stringify(req.user, null, 2));

    // Check if user is admin or sousadmin - if so, show all notifications
    const isAdmin = req.user.role === 'admin' || req.user.isAdmin === true;
    const isSousAdmin = req.user.role === 'sousAdmin';
    const canSeeAllNotifications = isAdmin || isSousAdmin;
    console.log('Is admin user:', isAdmin);
    console.log('Is sousadmin user:', isSousAdmin);
    console.log('Can see all notifications:', canSeeAllNotifications);

    let notifications;
    let total;

    if (canSeeAllNotifications) {
      // Admin and sousadmin can see all notifications
      notifications = await Notification.find({})
        .populate('reservationId', 'customerName customerPhone')
        .populate('propertyId', 'title')
        .populate('userId', 'firstName lastName username name')
        .populate('metadata.reminderId', 'message reminderType')
        .populate('seenBy', 'username firstName lastName name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      total = await Notification.countDocuments({});
    } else {
      // Regular user sees only their notifications
      notifications = await Notification.find({ userId })
        .populate('reservationId', 'customerName customerPhone')
        .populate('propertyId', 'title')
        .populate('userId', 'firstName lastName username name')
        .populate('metadata.reminderId', 'message reminderType')
        .populate('seenBy', 'username firstName lastName name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      total = await Notification.countDocuments({ userId });
    }

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
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
});

// Get unread notifications count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const unreadCount = await Notification.countDocuments({ 
      userId, 
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

// Mark notification as seen
router.put('/:id/seen', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    
    // Validate userId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error('Invalid userId format:', userId);
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }
    
    // First get the notification to check if user is already in seenBy
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    // Ensure seenBy is an array and contains valid ObjectIds
    if (!Array.isArray(notification.seenBy)) {
      await Notification.findByIdAndUpdate(req.params.id, { seenBy: [] });
      notification.seenBy = [];
    } else {
      // Filter out any invalid ObjectIds from seenBy array
      const validSeenBy = notification.seenBy.filter(id => 
        id && mongoose.Types.ObjectId.isValid(id.toString())
      );
      
      if (validSeenBy.length !== notification.seenBy.length) {
        await Notification.findByIdAndUpdate(req.params.id, { seenBy: validSeenBy });
        notification.seenBy = validSeenBy;
      }
    }
    
    // Check if user is already in seenBy
    const alreadySeen = notification.seenBy.some(seenUserId => 
      seenUserId && seenUserId.toString() === userId.toString()
    );
    
    if (alreadySeen) {
      // User already seen this notification, just return it
      const populatedNotification = await Notification.findById(req.params.id)
        .populate('seenBy', 'username fullName');
      
      return res.json({
        success: true,
        data: populatedNotification
      });
    }
    
    // Add user with full details to seenBy
    const fullName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.name || 'Unknown User';
    
    console.log('User data:', {
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      name: req.user.name,
      calculatedFullName: fullName,
      userId: userId
    });
    
    const updatedNotification = await Notification.findByIdAndUpdate(
      req.params.id,
      { 
        $addToSet: { 
          seenBy: new mongoose.Types.ObjectId(userId)  // Explicitly create ObjectId
        }
      },
      { new: true }
    );

    // Manually populate seenBy with user data
    const populatedNotification = await Notification.findById(req.params.id)
      .populate('seenBy', 'username fullName');

    console.log('Updated notification with seenBy:', populatedNotification.seenBy);

    res.json({
      success: true,
      data: populatedNotification
    });
  } catch (error) {
    console.error('Error marking notification as seen:', error);
    
    // If it's a cast error, try to clean up the data and retry
    if (error.name === 'CastError' && error.message.includes('seenBy')) {
      console.log('🔧 Attempting to fix corrupted seenBy data...');
      
      try {
        // Clean up the specific notification
        await Notification.findByIdAndUpdate(req.params.id, { seenBy: [] });
        
        // Retry the operation
        const userId = req.user._id || req.user.id;
        const updatedNotification = await Notification.findByIdAndUpdate(
          req.params.id,
          { 
            $addToSet: { 
              seenBy: new mongoose.Types.ObjectId(userId)
            }
          },
          { new: true }
        ).populate('seenBy', 'username fullName');

        return res.json({
          success: true,
          data: updatedNotification
        });
      } catch (retryError) {
        console.error('Retry failed:', retryError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as seen'
    });
  }
});

// Mark notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId },
      { 
        read: true, 
        readAt: new Date() 
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
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

// Mark all notifications as read
router.put('/read-all', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const result = await Notification.updateMany(
      { userId, read: false },
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
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
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

// Create notification (internal use by reminder service)
router.post('/create', async (req, res) => {
  try {
    const {
      type,
      title,
      message,
      reservationId,
      propertyId,
      userId,
      metadata
    } = req.body;

    const notification = await Notification.create({
      type,
      title,
      message,
      reservationId,
      propertyId,
      userId,
      metadata
    });

    await notification.populate('reservationId', 'customerName customerPhone');
    await notification.populate('propertyId', 'title');

    res.status(201).json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create notification'
    });
  }
});

module.exports = router;
