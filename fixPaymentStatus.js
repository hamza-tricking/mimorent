require('dotenv').config();
const mongoose = require('mongoose');
const Reservation = require('./models/reservation.model');
require('./models/property.model');

const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mimorent';

async function fixPaymentStatus() {
  try {
    await mongoose.connect(mongodbUri);
    console.log('Connected to MongoDB');

    const reservations = await Reservation.find({});
    console.log(`Found ${reservations.length} reservations`);

    let fixed = 0;
    for (const reservation of reservations) {
      const correctRemaining = reservation.totalPrice - reservation.paidAmount;
      let correctStatus;
      if (correctRemaining <= 0) {
        correctStatus = 'paid';
      } else if (reservation.paidAmount > 0) {
        correctStatus = 'partial';
      } else {
        correctStatus = 'pending';
      }

      if (reservation.remainingAmount !== correctRemaining || reservation.paymentStatus !== correctStatus) {
        reservation.remainingAmount = correctRemaining;
        reservation.paymentStatus = correctStatus;
        await reservation.save();
        fixed++;
      }
    }

    console.log(`Fixed ${fixed} reservations with inconsistent payment data`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

fixPaymentStatus();
