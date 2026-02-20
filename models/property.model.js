const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Property title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
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
        return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(value) || /^\/uploads\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(value);
      },
      message: 'Image must be a valid URL or file path with supported image extension'
    }
  }],
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
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
propertySchema.index({ title: 'text', description: 'text' });
propertySchema.index({ wilayaId: 1 });
propertySchema.index({ officeId: 1 });
propertySchema.index({ pricePerDay: 1 });
propertySchema.index({ available: 1 });

// Static method to find available properties
propertySchema.statics.findAvailable = function(filters = {}) {
  return this.find({ ...filters, available: true });
};

// Static method to find properties by wilaya
propertySchema.statics.findByWilaya = function(wilayaId) {
  return this.find({ wilayaId });
};

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
