const mongoose = require('mongoose');

const officeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Office name is required'],
    trim: true,
    maxlength: [100, 'Office name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: false,
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email address'
    ]
  },
  phone: {
    type: String,
    required: false,
    trim: true,
    maxlength: [20, 'Phone number cannot exceed 20 characters']
  },
  address: {
    street: {
      type: String,
      required: false,
      trim: true
    },
    city: {
      type: String,
      required: false,
      trim: true
    },
    wilaya: {
      type: String,
      required: false,
      trim: true
    },
    zipCode: {
      type: String,
      trim: true
    }
  },
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  employees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  logo: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  workingHours: {
    monday: { open: String, close: String },
    tuesday: { open: String, close: String },
    wednesday: { open: String, close: String },
    thursday: { open: String, close: String },
    friday: { open: String, close: String },
    saturday: { open: String, close: String },
    sunday: { open: String, close: String }
  },
  socialMedia: {
    website: { type: String, trim: true },
    facebook: { type: String, trim: true },
    instagram: { type: String, trim: true },
    linkedin: { type: String, trim: true }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
officeSchema.index({ name: 'text', description: 'text' });
officeSchema.index({ 'address.wilaya': 1 });
officeSchema.index({ manager: 1 });
officeSchema.index({ isActive: 1 });
officeSchema.index({ email: 1 });

// Virtual for full address
officeSchema.virtual('fullAddress').get(function() {
  return `${this.address.street}, ${this.address.city}, ${this.address.wilaya}`;
});

// Static method to find active offices
officeSchema.statics.findActive = function(filters = {}) {
  return this.find({ ...filters, isActive: true });
};

// Instance method to check if office is open
officeSchema.methods.isOpen = function() {
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { weekday: 'lowercase' });
  const currentTime = now.toTimeString().slice(0, 5);
  
  const todayHours = this.workingHours[day];
  if (!todayHours || !todayHours.open || !todayHours.close) {
    return false;
  }
  
  return currentTime >= todayHours.open && currentTime <= todayHours.close;
};

const Office = mongoose.model('Office', officeSchema);

module.exports = Office;
