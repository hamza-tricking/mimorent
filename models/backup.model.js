const mongoose = require('mongoose');

const backupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    default: function() {
      return `backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    }
  },
  description: {
    type: String,
    default: 'Manual backup created by admin'
  },
  data: {
    properties: [{
      _id: String,
      title: String,
      description: String,
      location: String,
      pricePerDay: Number,
      available: Boolean,
      isReserved: Boolean,
      wilayaId: String,
      officeId: String,
      images: [String],
      reservationIds: [String],
      createdAt: Date,
      updatedAt: Date
    }],
    reservations: [{
      _id: String,
      customerName: String,
      customerPhone: String,
      startDate: Date,
      endDate: Date,
      totalPrice: Number,
      paidAmount: Number,
      remainingAmount: Number,
      paymentStatus: String,
      status: String,
      propertyId: String,
      employerId: String,
      isMarried: Boolean,
      numberOfPeople: String,
      identityImages: [String],
      notes: [String],
      createdAt: Date,
      updatedAt: Date
    }],
    users: [{
      _id: String,
      username: String,
      email: String,
      firstName: String,
      lastName: String,
      phone: String,
      role: String,
      isActive: Boolean,
      officeId: String,
      createdAt: Date,
      updatedAt: Date
    }],
    offices: [{
      _id: String,
      name: String,
      email: String,
      phone: String,
      address: {
        street: String,
        city: String,
        wilaya: String
      },
      isActive: Boolean,
      manager: String,
      employees: [String],
      createdAt: Date,
      updatedAt: Date
    }],
    wilayas: [{
      _id: String,
      name: String,
      code: String,
      isActive: Boolean,
      createdAt: Date,
      updatedAt: Date
    }]
  },
  metadata: {
    totalProperties: { type: Number, default: 0 },
    totalReservations: { type: Number, default: 0 },
    totalUsers: { type: Number, default: 0 },
    totalOffices: { type: Number, default: 0 },
    totalWilayas: { type: Number, default: 0 },
    backupSize: { type: String }, // in MB
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance
backupSchema.index({ createdAt: -1 });
backupSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Backup', backupSchema);
