const mongoose = require('mongoose');

const wilayaSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Wilaya name is required'],
    trim: true,
    maxlength: [50, 'Wilaya name cannot exceed 50 characters'],
    unique: true
  },
  code: {
    type: Number,
    required: [true, 'Wilaya code is required'],
    min: [1, 'Wilaya code must be at least 1'],
    max: [69, 'Wilaya code cannot exceed 58'],
    unique: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
wilayaSchema.index({ name: 1 });
wilayaSchema.index({ code: 1 });

// Static method to find wilaya by code
wilayaSchema.statics.findByCode = function(code) {
  return this.findOne({ code });
};

// Static method to find wilaya by name
wilayaSchema.statics.findByName = function(name) {
  return this.findOne({ name: new RegExp(name, 'i') });
};

const Wilaya = mongoose.model('Wilaya', wilayaSchema);

module.exports = Wilaya;
