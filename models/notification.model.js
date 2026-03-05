const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['reminder', 'reservation', 'system', 'alert'],
    default: 'reminder'
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  reservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reservation',
    required: true
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  metadata: {
    reminderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reminder'
    },
    customerName: String,
    propertyTitle: String,
    reminderType: String,
    reminderDateTime: Date
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for better performance
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ type: 1 });

// Virtual for checking if notification is recent (within last 24 hours)
notificationSchema.virtual('isRecent').get(function() {
  const now = new Date();
  const diffInHours = (now - this.createdAt) / (1000 * 60 * 60);
  return diffInHours <= 24;
});

// Instance method to mark as read
notificationSchema.methods.markAsRead = async function() {
  this.read = true;
  this.readAt = new Date();
  return await this.save();
};

// Static method to find unread notifications for a user
notificationSchema.statics.findUnreadForUser = function(userId) {
  return this.find({ userId, read: false }).sort({ createdAt: -1 });
};

// Static method to get notification statistics
notificationSchema.statics.getStats = function(userId) {
  return this.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        unread: { $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] } },
        recent: {
          $sum: {
            $cond: [
              { $gte: ['$createdAt', new Date(Date.now() - 24 * 60 * 60 * 1000)] },
              1,
              0
            ]
          }
        }
      }
    }
  ]);
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
