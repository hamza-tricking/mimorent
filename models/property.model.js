const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Property title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  type: {
    type: String,
    required: [true, 'Property type is required'],
    enum: {
      values: ['apartment', 'villa', 'shop'],
      message: 'Property type must be either apartment, villa, or shop'
    }
  },
  wilaya: {
    type: String,
    required: [true, 'Wilaya is required'],
    trim: true,
    maxlength: [50, 'Wilaya name cannot exceed 50 characters']
  },
  office: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Office',
    required: [true, 'Office reference is required']
  },
  prices: {
    daily: {
      type: Number,
      min: [0, 'Daily price cannot be negative'],
      validate: {
        validator: function(value) {
          return value >= 0;
        },
        message: 'Daily price must be a positive number'
      }
    },
    monthly: {
      type: Number,
      min: [0, 'Monthly price cannot be negative'],
      validate: {
        validator: function(value) {
          return value >= 0;
        },
        message: 'Monthly price must be a positive number'
      }
    },
    yearly: {
      type: Number,
      min: [0, 'Yearly price cannot be negative'],
      validate: {
        validator: function(value) {
          return value >= 0;
        },
        message: 'Yearly price must be a positive number'
      }
    }
  },
  status: {
    type: String,
    enum: {
      values: ['available', 'inactive'],
      message: 'Status must be either available or inactive'
    },
    default: 'available'
  },
  rooms: {
    type: Number,
    min: [0, 'Number of rooms cannot be negative'],
    validate: {
      validator: function(value) {
        return Number.isInteger(value) && value >= 0;
      },
      message: 'Rooms must be a non-negative integer'
    }
  },
  bathrooms: {
    type: Number,
    min: [0, 'Number of bathrooms cannot be negative'],
    validate: {
      validator: function(value) {
        return Number.isInteger(value) && value >= 0;
      },
      message: 'Bathrooms must be a non-negative integer'
    }
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  features: [{
    type: String,
    trim: true,
    maxlength: [100, 'Feature cannot exceed 100 characters']
  }],
  images: [{
    type: String,
    trim: true,
    validate: {
      validator: function(value) {
        return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(value) || /^\/uploads\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(value);
      },
      message: 'Image must be a valid URL or file path with supported image extension'
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
propertySchema.index({ title: 'text', description: 'text' });
propertySchema.index({ type: 1, status: 1 });
propertySchema.index({ wilaya: 1 });
propertySchema.index({ office: 1 });
propertySchema.index({ 'prices.daily': 1 });
propertySchema.index({ 'prices.monthly': 1 });
propertySchema.index({ 'prices.yearly': 1 });

// Virtual for checking if property has any pricing
propertySchema.virtual('hasPricing').get(function() {
  return this.prices.daily > 0 || this.prices.monthly > 0 || this.prices.yearly > 0;
});

// Pre-save middleware to ensure at least one price is set
propertySchema.pre('save', function(next) {
  if (!this.prices.daily && !this.prices.monthly && !this.prices.yearly) {
    next(new Error('At least one price (daily, monthly, or yearly) must be specified'));
  } else {
    next();
  }
});

// Static method to find available properties
propertySchema.statics.findAvailable = function(filters = {}) {
  return this.find({ ...filters, status: 'available' });
};

// Instance method to check property availability
propertySchema.methods.isAvailable = function() {
  return this.status === 'available';
};

const Property = mongoose.model('Property', propertySchema);

module.exports = Property;
