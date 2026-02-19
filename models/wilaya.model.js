const mongoose = require('mongoose');

const wilayaSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Wilaya name is required'],
    trim: true,
    maxlength: [50, 'Wilaya name cannot exceed 50 characters'],
    unique: true
  },
  image: {
    type: String,
    required: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
wilayaSchema.index({ name: 1 });

// Static method to find wilaya by name
wilayaSchema.statics.findByName = function(name) {
  return this.findOne({ name: new RegExp(name, 'i') });
};

const Wilaya = mongoose.model('Wilaya', wilayaSchema);

module.exports = Wilaya;
