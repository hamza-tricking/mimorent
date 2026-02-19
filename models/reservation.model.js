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
    required: [true, 'Employer reference is required']
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
    trim: true,
    maxlength: [20, 'Customer phone cannot exceed 20 characters']
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
  status: {
    type: String,
    enum: {
      values: ['pending', 'approved', 'cancelled'],
      message: 'Status must be either pending, approved, or cancelled'
    },
    default: 'pending'
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

// Pre-save middleware to validate dates
reservationSchema.pre('save', function(next) {
  if (this.startDate >= this.endDate) {
    return next(new Error('End date must be after start date'));
  }
  next();
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
