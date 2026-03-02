const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  reservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reservation',
    required: [true, 'Reservation reference is required']
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property reference is required']
  },
  reminderType: {
    type: String,
    required: [true, 'Reminder type is required'],
    enum: ['before_end', 'specific_time'],
    default: 'before_end'
  },
  reminderDateTime: {
    type: Date,
    required: function() {
      return this.reminderType === 'specific_time';
    }
  },
  daysBeforeEnd: {
    type: Number,
    required: function() {
      return this.reminderType === 'before_end';
    },
    min: [1, 'Days before end must be at least 1'],
    max: [30, 'Days before end cannot exceed 30']
  },
  message: {
    type: String,
    required: [true, 'Reminder message is required'],
    trim: true,
    maxlength: [500, 'Message cannot exceed 500 characters']
  },
  status: {
    type: String,
    required: [true, 'Reminder status is required'],
    enum: ['pending', 'sent'],
    default: 'pending'
  },
  sentAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
reminderSchema.index({ reservationId: 1 });
reminderSchema.index({ propertyId: 1 });
reminderSchema.index({ status: 1 });
reminderSchema.index({ reminderDateTime: 1 });

// Virtual for calculated reminder date
reminderSchema.virtual('calculatedReminderDate').get(function() {
  if (this.reminderType === 'specific_time') {
    return this.reminderDateTime;
  }
  
  if (this.reminderType === 'before_end' && this.reservationId && this.reservationId.endDate) {
    const endDate = new Date(this.reservationId.endDate);
    const reminderDate = new Date(endDate.getTime() - (this.daysBeforeEnd * 24 * 60 * 60 * 1000));
    // Set to 9:00 AM UTC for consistency with modal display
    reminderDate.setHours(9, 0, 0, 0);
    return reminderDate;
  }
  
  return null;
});

// Virtual for checking if reminder is due
reminderSchema.virtual('isDue').get(function() {
  const reminderDate = this.calculatedReminderDate;
  if (!reminderDate || this.status !== 'pending') {
    return false;
  }
  return new Date() >= reminderDate;
});

// Pre-save middleware to validate reminder date is within reservation period
reminderSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('reminderDateTime') || this.isModified('daysBeforeEnd')) {
    try {
      const reservation = await mongoose.model('Reservation').findById(this.reservationId);
      if (!reservation) {
        return next(new Error('Reservation not found'));
      }
      
      const startDate = new Date(reservation.startDate);
      const endDate = new Date(reservation.endDate);
      const now = new Date();
      
      if (now > endDate) {
        return next(new Error('Cannot create reminders for expired reservations'));
      }
      
      if (this.reminderType === 'specific_time' && this.reminderDateTime) {
        const reminderDate = new Date(this.reminderDateTime);
        if (reminderDate < startDate || reminderDate > endDate) {
          return next(new Error('Reminder date must be within reservation period'));
        }
      }
      
      if (this.reminderType === 'before_end' && this.daysBeforeEnd) {
        const reminderDate = new Date(endDate.getTime() - (this.daysBeforeEnd * 24 * 60 * 60 * 1000));
        if (reminderDate < startDate) {
          return next(new Error('Reminder date cannot be before reservation start date'));
        }
      }
    } catch (error) {
      return next(error);
    }
  }
  
  next();
});

// Static method to create reminder for reservation
reminderSchema.statics.createForReservation = async function(reservationId, reminderData) {
  const reservation = await mongoose.model('Reservation').findById(reservationId)
    .populate('propertyId');
  
  if (!reservation) {
    throw new Error('Reservation not found');
  }
  
  if (!reservation.propertyId.isReserved) {
    throw new Error('Can only create reminders for reserved properties');
  }
  
  const reminder = new this({
    ...reminderData,
    reservationId: reservation._id,
    propertyId: reservation.propertyId._id
  });
  
  return await reminder.save();
};

// Static method to find due reminders
reminderSchema.statics.findDueReminders = async function() {
  const now = new Date();
  console.log('🔍 Finding due reminders at:', now.toISOString());
  
  // First, let's see all reminders for debugging
  const allReminders = await this.find({}).populate('reservationId propertyId');
  console.log('📋 All reminders in database:', allReminders.length);
  allReminders.forEach(r => {
    console.log(`  - ${r._id}: ${r.reminderType} - ${r.status} - ${r.reminderDateTime}`);
  });
  
  // Find reminders with specific time that are due
  const specificTimeReminders = await this.find({
    reminderType: 'specific_time',
    reminderDateTime: { $lte: now },
    status: 'pending'
  }).populate('reservationId propertyId');
  
  console.log('📋 Found specific time reminders:', specificTimeReminders.length);
  specificTimeReminders.forEach(r => {
    console.log(`  - ${r._id}: ${r.reminderDateTime} (${r.reminderType})`);
  });
  
  // Find reminders before end that are due
  const beforeEndReminders = await this.find({
    reminderType: 'before_end',
    status: 'pending'
  }).populate('reservationId propertyId');
  
  console.log('📋 Found before end reminders:', beforeEndReminders.length);
  beforeEndReminders.forEach(r => {
    console.log(`  - ${r._id}: ${r.daysBeforeEnd} days before end (${r.reminderType})`);
  });
  
  // Filter before end reminders to only include those that are actually due
  const dueBeforeEndReminders = beforeEndReminders.filter(reminder => {
    if (!reminder.reservationId || !reminder.reservationId.endDate) return false;
    
    const endDate = new Date(reminder.reservationId.endDate);
    const reminderDate = new Date(endDate.getTime() - (reminder.daysBeforeEnd * 24 * 60 * 60 * 1000));
    // Set to 9:00 AM UTC for consistency with modal display
    reminderDate.setHours(9, 0, 0, 0);
    
    console.log(`  - Checking ${reminder._id}: end=${endDate.toISOString()}, reminder=${reminderDate.toISOString()}, now=${now.toISOString()}, due=${now >= reminderDate}`);
    
    return now >= reminderDate;
  });
  
  console.log('📋 Due before end reminders:', dueBeforeEndReminders.length);
  
  const allDueReminders = [...specificTimeReminders, ...dueBeforeEndReminders];
  console.log('📋 Total due reminders:', allDueReminders.length);
  
  return allDueReminders;
};

// Instance method to mark as sent
reminderSchema.methods.markAsSent = async function() {
  this.status = 'sent';
  this.sentAt = new Date();
  return await this.save();
};

const Reminder = mongoose.model('Reminder', reminderSchema);

module.exports = Reminder;
