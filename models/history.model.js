const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  action: {
    type: String,
    required: [true, 'Action type is required'],
    enum: ['reservation_created', 'reservation_updated', 'reservation_cancelled', 'reservation_completed'],
    trim: true
  },
  entityType: {
    type: String,
    required: [true, 'Entity type is required'],
    enum: ['reservation', 'property', 'user', 'office'],
    trim: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Entity ID is required'],
    refPath: 'entityType'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
historySchema.index({ action: 1, createdAt: -1 });
historySchema.index({ userId: 1, createdAt: -1 });
historySchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
historySchema.index({ createdAt: -1 });

// Virtual for formatted date
historySchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('ar-DZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

// Static method to create reservation history entry
historySchema.statics.createReservationHistory = async function(data) {
  const { action, reservationId, userId, description, metadata = {}, ipAddress, userAgent } = data;
  
  return await this.create({
    action,
    entityType: 'reservation',
    entityId: reservationId,
    userId,
    description,
    metadata,
    ipAddress,
    userAgent
  });
};

// Static method to get reservation history
historySchema.statics.getReservationHistory = async function(filters = {}, options = {}) {
  const { page = 1, limit = 50 } = options;
  const skip = (page - 1) * limit;
  
  const query = {
    entityType: 'reservation',
    ...filters
  };
  
  const history = await this.find(query)
    .populate('userId', 'username firstName lastName email')
    .populate('entityId', 'customerName customerPhone totalPrice status')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  
  const total = await this.countDocuments(query);
  
  return {
    history,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

const History = mongoose.model('History', historySchema);

module.exports = History;
