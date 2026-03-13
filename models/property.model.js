const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Property title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  location: {
    type: String,
    required: [true, 'Property location is required'],
    trim: true,
    maxlength: [500, 'Location cannot exceed 500 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  pricePerDay: {
    type: Number,
    required: [true, 'Price per day is required'],
    min: [0, 'Price per day cannot be negative']
  },
  images: [{
    type: String,
    trim: true,
    validate: {
      validator: function(value) {
        // Allow local file paths
        if (/^\/uploads\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(value)) {
          return true;
        }
        
        // Allow base64 data URLs
        if (/^data:image\/(jpeg|jpg|png|gif|webp);base64,/.test(value)) {
          return true;
        }
        
        // Allow URLs with image extensions (with or without query parameters)
        const urlWithExtension = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(value);
        if (urlWithExtension) {
          return true;
        }
        
        // Allow common image hosting domains (Google Images, iStock, etc.)
        const imageHostingDomains = [
          'encrypted-tbn0.gstatic.com',
          'encrypted-tbn1.gstatic.com', 
          'encrypted-tbn2.gstatic.com',
          'encrypted-tbn3.gstatic.com',
          'i.imgur.com',
          'i.ibb.co',
          'images.unsplash.com',
          'cdn.pixabay.com',
          'images.pexels.com'
        ];
        
        try {
          const url = new URL(value);
          return imageHostingDomains.some(domain => url.hostname.includes(domain));
        } catch {
          return false;
        }
      },
      message: 'Image must be a valid URL, base64 data URL, or file path with supported image extension'
    }
  }],
  propertyType: {
    type: String,
    required: [true, 'Property type is required'],
    enum: {
      values: ['home', 'villa', 'shop'],
      message: 'Property type must be home, villa, or shop'
    },
    default: 'home'
  },
  wilayaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wilaya',
    required: [true, 'Wilaya reference is required']
  },
  officeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Office',
    required: [true, 'Office reference is required']
  },
  available: {
    type: Boolean,
    default: true
  },
  isReserved: {
    type: Boolean,
    default: false
  },
  reservationIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reservation'
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
propertySchema.index({ title: 'text', description: 'text', location: 'text' });
propertySchema.index({ wilayaId: 1 });
propertySchema.index({ officeId: 1 });
propertySchema.index({ pricePerDay: 1 });
propertySchema.index({ isReserved: 1 });
propertySchema.index({ available: 1 });
propertySchema.index({ location: 'text' });
propertySchema.index({ reservationIds: 1 });

// Static method to find available properties
propertySchema.statics.findAvailable = function(filters = {}) {
  return this.find({ ...filters, available: true });
};

// Static method to find properties by wilaya
propertySchema.statics.findByWilaya = function(wilayaId) {
  return this.find({ wilayaId });
};

// Method to update reservation status
propertySchema.methods.updateReservationStatus = async function() {
  const Reservation = mongoose.model('Reservation');
  const activeReservations = await Reservation.countDocuments({
    _id: { $in: this.reservationIds },
    status: { $in: ['pending', 'confirmed'] }
  });
  
  this.isReserved = activeReservations > 0;
  return this.save();
};

// Method to check if property is available for given date range
propertySchema.methods.isAvailableForDates = async function(startDate, endDate) {
  const Reservation = mongoose.model('Reservation');
  const overlappingReservations = await Reservation.find({
    _id: { $in: this.reservationIds },
    status: { $in: ['pending', 'confirmed'] },
    $or: [
      {
        startDate: { $lte: new Date(endDate) },
        endDate: { $gte: new Date(startDate) }
      }
    ]
  });
  
  return overlappingReservations.length === 0;
};

// Method to add a reservation if no overlap exists
propertySchema.methods.addReservation = async function(reservationId) {
  if (!this.reservationIds) {
    this.reservationIds = [];
  }
  
  // Check if reservation already exists
  if (this.reservationIds.includes(reservationId)) {
    throw new Error('Reservation already exists for this property');
  }
  
  // Add the reservation
  this.reservationIds.push(reservationId);
  this.isReserved = true;
  
  return this.save();
};

// Method to remove a reservation
propertySchema.methods.removeReservation = async function(reservationId) {
  if (!this.reservationIds) {
    return this;
  }
  
  this.reservationIds = this.reservationIds.filter(id => !id.equals(reservationId));
  
  // Update isReserved status based on remaining reservations
  const Reservation = mongoose.model('Reservation');
  const activeReservations = await Reservation.countDocuments({
    _id: { $in: this.reservationIds },
    status: { $in: ['pending', 'confirmed'] }
  });
  
  this.isReserved = activeReservations > 0;
  return this.save();
};

// Pre-save middleware to update reservation status if needed
propertySchema.pre('save', function(next) {
  // If available is false, make sure isReserved is also false
  if (!this.available && this.isReserved) {
    this.isReserved = false;
  }
  next();
});

// Static method to find properties by office
propertySchema.statics.findByOffice = function(officeId) {
  return this.find({ officeId });
};

// Instance method to check property availability
propertySchema.methods.isAvailable = function() {
  return this.available;
};

const Property = mongoose.model('Property', propertySchema);

module.exports = Property;
