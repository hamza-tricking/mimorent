const express = require('express');
const router = express.Router();
// const Notification = require('../models/notification.model');
// const auth = require('../middlewares/auth.middleware');

console.log('Notification routes loaded successfully');

// Get all notifications for the logged-in admin
router.get('/', async (req, res) => {
  try {
    // Temporary response to test if the route is working
    res.json({
      success: true,
      data: [],
      message: 'Notification routes are working!'
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
router.get('/unread-count', async (req, res) => {
  try {
    // Temporary response
    res.json({
      success: true,
      data: { unreadCount: 0 }
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
router.put('/:id/read', async (req, res) => {
  try {
    // Temporary response
    res.json({
      success: true,
      data: { _id: req.params.id, read: true }
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
router.put('/read-all', async (req, res) => {
  try {
    // Temporary response
    res.json({
      success: true,
      data: { modifiedCount: 0 }
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
router.delete('/:id', async (req, res) => {
  try {
    // Temporary response
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

// Get notification statistics
router.get('/stats', async (req, res) => {
  try {
    // Temporary response
    res.json({
      success: true,
      data: { total: 0, unread: 0, recent: 0 }
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification stats'
    });
  }
});

// Create notification (internal use by reminder service)
router.post('/create', async (req, res) => {
  try {
    // Temporary response
    res.status(201).json({
      success: true,
      data: { _id: 'temp-id', message: 'Notification created successfully' }
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
