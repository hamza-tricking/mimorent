const mongoose = require('mongoose');

const ordersReservationSchema = new mongoose.Schema({
  // Type of order: 'reserver_property' for properties already reserved, 'notreserver_property' for properties not reserved yet
  orderType: {
    type: String,
    required: [true, 'Order type is required'],
    enum: ['reserver_property', 'notreserver_property'],
    default: 'notreserver_property'
  },
  
  // Client information
  fullname: {
    type: String,
    required: [true, 'Client full name is required'],
    trim: true,
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    validate: {
      validator: function(v) {
        // Algerian phone number validation: starts with 0, followed by 8-9 digits
        // Accepts formats: 0XXXXXXXXX, 0X XXX XXXX, +213 X XXX XXXX
        const cleanNumber = v.replace(/[\s\-\(\)]+/g, '');
        return /^0[5-7]\d{8}$/.test(cleanNumber) || /^\+213[5-7]\d{8}$/.test(cleanNumber);
      },
      message: 'Phone number must be a valid Algerian number (e.g., 0XXXXXXXXX or +213XXXXXXXXX)'
    }
  },
  
  // Property reference
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property reference is required']
  },
  
  // Wilaya reference
  wilayaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wilaya',
    required: [true, 'Wilaya reference is required']
  },
  
  // Reservation period
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  
  // Order status
  status: {
    type: String,
    required: [true, 'Order status is required'],
    enum: ['pending', 'processing', 'approved', 'rejected', 'completed'],
    default: 'pending'
  },
  
  // Additional notes from client
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  
  // Admin response/notes
  adminNotes: {
    type: String,
    trim: true,
    maxlength: [500, 'Admin notes cannot exceed 500 characters']
  },
  
  // Priority level
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
ordersReservationSchema.index({ orderType: 1, status: 1 });
ordersReservationSchema.index({ propertyId: 1 });
ordersReservationSchema.index({ wilayaId: 1 });
ordersReservationSchema.index({ createdAt: -1 });
ordersReservationSchema.index({ startDate: 1, endDate: 1 });
ordersReservationSchema.index({ fullname: 'text', phoneNumber: 'text' });

// Virtual for reservation duration in days
ordersReservationSchema.virtual('durationDays').get(function() {
  const diffTime = Math.abs(this.endDate - this.startDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to validate dates
ordersReservationSchema.pre('save', function(next) {
  // Convert dates to Date objects if they are strings
  const startDate = this.startDate instanceof Date ? this.startDate : new Date(this.startDate);
  const endDate = this.endDate instanceof Date ? this.endDate : new Date(this.endDate);
  
  if (startDate >= endDate) {
    return next(new Error('End date must be after start date'));
  }
  
  // Validate that start date is not in the past for new orders
  if (this.isNew && startDate < new Date()) {
    return next(new Error('Start date cannot be in the past'));
  }
  
  next();
});

// Static method to find orders by type
ordersReservationSchema.statics.findByType = function(orderType, filters = {}) {
  return this.find({ ...filters, orderType });
};

// Static method to find pending orders
ordersReservationSchema.statics.findPending = function(filters = {}) {
  return this.find({ ...filters, status: 'pending' });
};

// Static method to find orders by property
ordersReservationSchema.statics.findByProperty = function(propertyId) {
  return this.find({ propertyId }).sort({ createdAt: -1 });
};

// Static method to find orders by wilaya
ordersReservationSchema.statics.findByWilaya = function(wilayaId) {
  return this.find({ wilayaId }).sort({ createdAt: -1 });
};

// Instance method to approve order
ordersReservationSchema.methods.approve = function(adminNotes = '') {
  this.status = 'approved';
  if (adminNotes) this.adminNotes = adminNotes;
  return this.save();
};

// Instance method to reject order
ordersReservationSchema.methods.reject = function(adminNotes = '') {
  this.status = 'rejected';
  if (adminNotes) this.adminNotes = adminNotes;
  return this.save();
};

// Instance method to process order
ordersReservationSchema.methods.process = function() {
  this.status = 'processing';
  return this.save();
};

// Instance method to complete order
ordersReservationSchema.methods.complete = function() {
  this.status = 'completed';
  return this.save();
};

// Instance method to check if order can be processed
ordersReservationSchema.methods.canProcess = function() {
  return this.status === 'pending';
};

// Instance method to check if order is active
ordersReservationSchema.methods.isActive = function() {
  return ['pending', 'processing'].includes(this.status);
};

const OrdersReservation = mongoose.model('OrdersReservation', ordersReservationSchema);

module.exports = OrdersReservation;
