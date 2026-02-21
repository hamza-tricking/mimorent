const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property reference is required']
  },
  employerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  customerName: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true,
    maxlength: [100, 'Customer name cannot exceed 100 characters']
  },
  customerPhone: {
    type: String,
    required: [true, 'Customer phone is required'],
    trim: true
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  totalPrice: {
    type: Number,
    required: [true, 'Total price is required'],
    min: [0, 'Total price cannot be negative']
  },
  paidAmount: {
    type: Number,
    required: [true, 'Paid amount is required'],
    min: [0, 'Paid amount cannot be negative'],
    default: 0
  },
  remainingAmount: {
    type: Number,
    required: [true, 'Remaining amount is required'],
    min: [0, 'Remaining amount cannot be negative'],
    default: 0
  },
  paymentStatus: {
    type: String,
    required: [true, 'Payment status is required'],
    enum: ['pending', 'partial', 'paid'],
    default: 'pending'
  },
  status: {
    type: String,
    required: [true, 'Reservation status is required'],
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  },
  notificationSent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
reservationSchema.index({ propertyId: 1, status: 1 });
reservationSchema.index({ employerId: 1, status: 1 });
reservationSchema.index({ startDate: 1, endDate: 1 });
reservationSchema.index({ status: 1 });
reservationSchema.index({ createdAt: -1 });

// Virtual for reservation duration in days
reservationSchema.virtual('durationDays').get(function() {
  const diffTime = Math.abs(this.endDate - this.startDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to validate dates and calculate amounts
reservationSchema.pre('save', function(next) {
  // Convert dates to Date objects if they are strings
  const startDate = this.startDate instanceof Date ? this.startDate : new Date(this.startDate);
  const endDate = this.endDate instanceof Date ? this.endDate : new Date(this.endDate);
  
  if (startDate >= endDate) {
    return next(new Error('End date must be after start date'));
  }
  
  // Calculate remaining amount if not provided
  if (this.isModified('paidAmount') || this.isModified('totalPrice')) {
    this.remainingAmount = this.totalPrice - this.paidAmount;
    
    // Update payment status based on amounts
    if (this.remainingAmount <= 0) {
      this.paymentStatus = 'paid';
    } else if (this.paidAmount > 0) {
      this.paymentStatus = 'partial';
    } else {
      this.paymentStatus = 'pending';
    }
  }
  
  next();
});

// Post-save middleware to trigger notifications and update property status
reservationSchema.post('save', async function(doc) {
  // Check if reservation is ending soon (within 1 day) and notification not sent
  const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const isEndingSoon = doc.endDate <= oneDayFromNow && doc.endDate > new Date();
  
  if (isEndingSoon && !doc.notificationSent && doc.status === 'confirmed') {
    // Trigger notification (you can implement this with a notification service)
    console.log('Reservation ending soon notification triggered for:', doc._id);
    
    // Mark notification as sent (in a real implementation, this would be handled by a notification service)
    doc.notificationSent = true;
    doc.save().catch(err => console.error('Error updating notification status:', err));
  }
  
  // Update property reservation status
  try {
    const Property = mongoose.model('Property');
    const property = await Property.findById(doc.propertyId);
    if (property) {
      await property.updateReservationStatus();
    }
  } catch (error) {
    console.error('Error updating property reservation status:', error);
  }
});

// Post-remove middleware to update property status when reservation is deleted
reservationSchema.post('remove', async function(doc) {
  try {
    const Property = mongoose.model('Property');
    const property = await Property.findById(doc.propertyId);
    if (property) {
      await property.updateReservationStatus();
    }
  } catch (error) {
    console.error('Error updating property reservation status after deletion:', error);
  }
});

// Static method to find active reservations
reservationSchema.statics.findActive = function(filters = {}) {
  return this.find({ 
    ...filters, 
    status: { $in: ['pending', 'approved'] } 
  });
};

// Static method to check property availability
reservationSchema.statics.checkAvailability = async function(propertyId, startDate, endDate, excludeReservationId = null) {
  const query = {
    propertyId,
    status: { $in: ['pending', 'approved'] },
    $or: [
      { startDate: { $lt: endDate }, endDate: { $gt: startDate } }
    ]
  };
  
  if (excludeReservationId) {
    query._id = { $ne: excludeReservationId };
  }
  
  const conflictingReservation = await this.findOne(query);
  return !conflictingReservation;
};

// Instance method to check if reservation can be cancelled
reservationSchema.methods.canBeCancelled = function() {
  return this.status === 'pending' || this.status === 'approved';
};

// Instance method to check if reservation is active
reservationSchema.methods.isActive = function() {
  return this.status === 'pending' || this.status === 'approved';
};

const Reservation = mongoose.model('Reservation', reservationSchema);

module.exports = Reservation;
