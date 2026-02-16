const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property reference is required']
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Customer reference is required']
  },
  office: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Office',
    required: [true, 'Office reference is required']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  priceType: {
    type: String,
    enum: {
      values: ['daily', 'monthly', 'yearly'],
      message: 'Price type must be either daily, monthly, or yearly'
    },
    required: [true, 'Price type is required']
  },
  totalPrice: {
    type: Number,
    required: [true, 'Total price is required'],
    min: [0, 'Total price cannot be negative']
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'confirmed', 'cancelled', 'completed'],
      message: 'Status must be either pending, confirmed, cancelled, or completed'
    },
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: {
      values: ['pending', 'paid', 'refunded'],
      message: 'Payment status must be either pending, paid, or refunded'
    },
    default: 'pending'
  },
  numberOfGuests: {
    type: Number,
    min: [1, 'Number of guests must be at least 1'],
    max: [20, 'Number of guests cannot exceed 20']
  },
  specialRequests: {
    type: String,
    trim: true,
    maxlength: [500, 'Special requests cannot exceed 500 characters']
  },
  cancellationReason: {
    type: String,
    trim: true,
    maxlength: [300, 'Cancellation reason cannot exceed 300 characters']
  },
  cancelledAt: {
    type: Date
  },
  confirmedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
bookingSchema.index({ property: 1, status: 1 });
bookingSchema.index({ customer: 1, status: 1 });
bookingSchema.index({ office: 1, status: 1 });
bookingSchema.index({ startDate: 1, endDate: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ paymentStatus: 1 });
bookingSchema.index({ createdAt: -1 });

// Virtual for booking duration in days
bookingSchema.virtual('durationDays').get(function() {
  const diffTime = Math.abs(this.endDate - this.startDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for booking duration in months
bookingSchema.virtual('durationMonths').get(function() {
  return Math.ceil(this.durationDays / 30);
});

// Virtual for booking duration in years
bookingSchema.virtual('durationYears').get(function() {
  return Math.ceil(this.durationDays / 365);
});

// Pre-save middleware to validate dates
bookingSchema.pre('save', function(next) {
  if (this.startDate >= this.endDate) {
    return next(new Error('End date must be after start date'));
  }
  next();
});

// Pre-save middleware to set timestamps based on status changes
bookingSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    const now = new Date();
    
    switch (this.status) {
      case 'confirmed':
        this.confirmedAt = now;
        break;
      case 'cancelled':
        this.cancelledAt = now;
        break;
      case 'completed':
        this.completedAt = now;
        break;
    }
  }
  next();
});

// Static method to find active bookings
bookingSchema.statics.findActive = function(filters = {}) {
  return this.find({ 
    ...filters, 
    status: { $in: ['pending', 'confirmed'] } 
  });
};

// Static method to check property availability
bookingSchema.statics.checkAvailability = async function(propertyId, startDate, endDate, excludeBookingId = null) {
  const query = {
    property: propertyId,
    status: { $in: ['pending', 'confirmed'] },
    $or: [
      { startDate: { $lt: endDate }, endDate: { $gt: startDate } }
    ]
  };
  
  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }
  
  const conflictingBooking = await this.findOne(query);
  return !conflictingBooking;
};

// Instance method to check if booking can be cancelled
bookingSchema.methods.canBeCancelled = function() {
  return this.status === 'pending' || this.status === 'confirmed';
};

// Instance method to check if booking is active
bookingSchema.methods.isActive = function() {
  return this.status === 'pending' || this.status === 'confirmed';
};

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
