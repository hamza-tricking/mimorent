const express = require('express');
const router = express.Router();
const Notification = require('../models/notification.model');
const auth = require('../middlewares/auth.middleware');

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

    // Check if user is admin - if so, show all notifications
    const isAdmin = req.user.role === 'admin' || req.user.isAdmin === true;
    console.log('Is admin user:', isAdmin);

    let notifications;
    let total;

    if (isAdmin) {
      // Admin can see all notifications
      notifications = await Notification.find({})
        .populate('reservationId', 'customerName customerPhone')
        .populate('propertyId', 'title')
        .populate('metadata.reminderId', 'message reminderType')
        .populate('seenBy', 'username fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      total = await Notification.countDocuments({});
      console.log('Admin user - fetching all notifications');
    } else {
      // Regular user sees only their notifications
      notifications = await Notification.find({ userId })
        .populate('reservationId', 'customerName customerPhone')
        .populate('propertyId', 'title')
        .populate('metadata.reminderId', 'message reminderType')
        .populate('seenBy', 'username fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      total = await Notification.countDocuments({ userId });
      console.log('Regular user - fetching their notifications');
    }

    console.log('Found notifications:', notifications.length);
    console.log('Total notifications count:', total);

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
    
    // First get the notification to check if user is already in seenBy
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    // Check if user is already in seenBy
    const alreadySeen = notification.seenBy.some(seenUserId => 
      seenUserId.toString() === userId.toString()
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
    
    const updatedNotification = await Notification.findByIdAndUpdate(
      req.params.id,
      { 
        $addToSet: { 
          seenBy: {
            _id: userId,
            username: req.user.username || req.user.name || 'Unknown',
            fullName: fullName
          }
        }
      },
      { new: true }
    ).populate('seenBy', 'username fullName');

    console.log('Updated notification with seenBy:', updatedNotification.seenBy);
    console.log('User object from req.user:', req.user);
    console.log('Calculated fullName:', fullName);

    res.json({
      success: true,
      data: updatedNotification
    });
  } catch (error) {
    console.error('Error marking notification as seen:', error);
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
