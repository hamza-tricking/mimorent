const mongoose = require('mongoose');
const Notification = require('./models/notification.model');

require('dotenv').config();

async function cleanupSeenByData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mimorent');
    console.log('🔗 Connected to MongoDB');

    // Step 1: Find all notifications with corrupted seenBy data
    const corruptedNotifications = await Notification.find({
      $or: [
        { 'seenBy': { $type: 'string' } }, // seenBy is a string instead of array
        { 'seenBy': { $elemMatch: { $type: 'string' } } } // seenBy array contains strings
      ]
    });

    console.log(`📊 Found ${corruptedNotifications.length} notifications with corrupted seenBy data`);

    // Step 2: Clean up each notification
    for (const notification of corruptedNotifications) {
      console.log(`🧹 Cleaning notification: ${notification._id}`);
      
      let cleanSeenBy = [];
      
      if (Array.isArray(notification.seenBy)) {
        // Filter out any non-ObjectId values
        cleanSeenBy = notification.seenBy.filter(item => {
          if (!item) return false;
          
          // Convert to string for validation
          const itemStr = item.toString();
          
          // Check if it's a valid ObjectId format (24 hex characters)
          return mongoose.Types.ObjectId.isValid(itemStr);
        });
      }

      // Update the notification with clean seenBy array
      await Notification.findByIdAndUpdate(
        notification._id,
        { seenBy: cleanSeenBy }
      );

      console.log(`✅ Cleaned notification ${notification._id}: ${cleanSeenBy.length} valid entries remaining`);
    }

    // Step 3: Ensure all notifications have seenBy as arrays
    const notificationsWithoutSeenBy = await Notification.find({
      seenBy: { $exists: false }
    });

    console.log(`📊 Found ${notificationsWithoutSeenBy.length} notifications without seenBy field`);

    for (const notification of notificationsWithoutSeenBy) {
      await Notification.findByIdAndUpdate(
        notification._id,
        { seenBy: [] }
      );
      console.log(`✅ Added empty seenBy array to notification: ${notification._id}`);
    }

    // Step 4: Final verification
    const stillCorrupted = await Notification.find({
      $or: [
        { 'seenBy': { $type: 'string' } },
        { 'seenBy': { $elemMatch: { $type: 'string' } } }
      ]
    });

    if (stillCorrupted.length === 0) {
      console.log('🎉 All seenBy data has been cleaned successfully!');
    } else {
      console.log(`⚠️ Still found ${stillCorrupted.length} corrupted notifications`);
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the cleanup
cleanupSeenByData();
