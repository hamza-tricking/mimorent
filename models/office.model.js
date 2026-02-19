const mongoose = require('mongoose');

const officeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Office name is required'],
    trim: true,
    maxlength: [100, 'Office name cannot exceed 100 characters']
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true,
    maxlength: [200, 'Address cannot exceed 200 characters']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    maxlength: [20, 'Phone number cannot exceed 20 characters']
  },
  wilayaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wilaya',
    required: [true, 'Wilaya reference is required']
  },
  employers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
officeSchema.index({ name: 1 });
officeSchema.index({ wilayaId: 1 });
officeSchema.index({ employers: 1 });

// Static method to find offices by wilaya
officeSchema.statics.findByWilaya = function(wilayaId) {
  return this.find({ wilayaId });
};

const Office = mongoose.model('Office', officeSchema);

module.exports = Office;
