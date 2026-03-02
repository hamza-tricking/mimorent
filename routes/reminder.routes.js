const express = require('express');
const router = express.Router();
const Reminder = require('../models/reminder.model');
const auth = require('../middleware/auth.middleware');

// Get reminders for specific reservation
router.get('/admin/reminders/reservation/:reservationId', auth, async (req, res) => {
  try {
    const { reservationId } = req.params;
    
    const reminders = await Reminder.find({ reservationId })
      .populate('reservationId propertyId', 'title customerName customerPhone')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: { reminders }
    });
  } catch (error) {
    console.error('Error fetching reservation reminders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reservation reminders',
      error: error.message
    });
  }
});

// Create new reminder
router.post('/admin/reminders', auth, async (req, res) => {
  try {
    const {
      reservationId,
      reminderType,
      reminderDateTime,
      daysBeforeEnd,
      message
    } = req.body;
    
    // Validate required fields
    if (!reservationId || !reminderType || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: reservationId, reminderType, message'
      });
    }
    
    // Validate reminder type specific fields
    if (reminderType === 'specific_time' && !reminderDateTime) {
      return res.status(400).json({
        success: false,
        message: 'reminderDateTime is required for specific_time reminders'
      });
    }
    
    if (reminderType === 'before_end' && !daysBeforeEnd) {
      return res.status(400).json({
        success: false,
        message: 'daysBeforeEnd is required for before_end reminders'
      });
    }
    
    // Create reminder
    const reminder = await Reminder.createForReservation(
      reservationId,
      {
        reminderType,
        reminderDateTime: reminderDateTime ? new Date(reminderDateTime) : undefined,
        daysBeforeEnd,
        message
      }
    );
    
    await reminder.populate('reservationId propertyId', 'title customerName customerPhone');
    
    res.status(201).json({
      success: true,
      message: 'Reminder created successfully',
      data: { reminder }
    });
  } catch (error) {
    console.error('Error creating reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create reminder',
      error: error.message
    });
  }
});

// Delete reminder
router.delete('/admin/reminders/:reminderId', auth, async (req, res) => {
  try {
    const { reminderId } = req.params;
    
    const reminder = await Reminder.findById(reminderId);
    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }
    
    // Don't allow deleting sent reminders
    if (reminder.status === 'sent') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete sent reminders'
      });
    }
    
    await Reminder.findByIdAndDelete(reminderId);
    
    res.json({
      success: true,
      message: 'Reminder deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete reminder',
      error: error.message
    });
  }
});

// Get due reminders (for cron job)
router.get('/admin/reminders/due', auth, async (req, res) => {
  try {
    const dueReminders = await Reminder.findDueReminders();
    
    res.json({
      success: true,
      data: { reminders: dueReminders }
    });
  } catch (error) {
    console.error('Error fetching due reminders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch due reminders',
      error: error.message
    });
  }
});

// Mark reminder as sent
router.put('/admin/reminders/:reminderId/sent', auth, async (req, res) => {
  try {
    const { reminderId } = req.params;
    
    const reminder = await Reminder.findById(reminderId);
    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }
    
    await reminder.markAsSent();
    
    res.json({
      success: true,
      message: 'Reminder marked as sent successfully',
      data: { reminder }
    });
  } catch (error) {
    console.error('Error marking reminder as sent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark reminder as sent',
      error: error.message
    });
  }
});

module.exports = router;
