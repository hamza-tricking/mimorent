const mongoose = require('mongoose');
const History = require('./models/history.model');
const User = require('./models/user.model');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mimorent', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const createTestHistory = async () => {
  try {
    // Find a user to associate with history
    const user = await User.findOne({ role: 'admin' });
    if (!user) {
      console.log('No admin user found. Please create an admin user first.');
      return;
    }

    // Create test history entries
    const testHistoryEntries = [
      {
        action: 'reservation_created',
        entityType: 'reservation',
        entityId: new mongoose.Types.ObjectId(),
        userId: user._id,
        description: 'تم إنشاء حجز جديد للعميل محمد أحمد للعقار شقة رائعة في الجزائر',
        metadata: {
          customerName: 'محمد أحمد',
          customerPhone: '0555123456',
          startDate: new Date('2024-01-15'),
          endDate: new Date('2024-01-20'),
          totalPrice: 15000,
          paidAmount: 5000,
          remainingAmount: 10000,
          paymentStatus: 'partial',
          status: 'confirmed',
          propertyTitle: 'شقة رائعة في الجزائر',
          propertyId: new mongoose.Types.ObjectId(),
          propertyPricePerDay: 3000,
          employerId: null,
          createdAt: new Date(),
          reservationId: new mongoose.Types.ObjectId()
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Test Browser)'
      },
      {
        action: 'reservation_updated',
        entityType: 'reservation',
        entityId: new mongoose.Types.ObjectId(),
        userId: user._id,
        description: 'تم تحديث حجز العميل فاطمة علي',
        metadata: {
          customerName: 'فاطمة علي',
          customerPhone: '0666987654',
          startDate: new Date('2024-02-01'),
          endDate: new Date('2024-02-05'),
          totalPrice: 12000,
          paidAmount: 12000,
          remainingAmount: 0,
          paymentStatus: 'paid',
          status: 'confirmed',
          propertyTitle: 'فيلا فاخرة في وهران',
          propertyId: new mongoose.Types.ObjectId(),
          propertyPricePerDay: 4000,
          employerId: null,
          changes: {
            paymentStatus: true,
            paidAmount: true,
            remainingAmount: true
          },
          updatedAt: new Date(),
          reservationId: new mongoose.Types.ObjectId()
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Test Browser)'
      },
      {
        action: 'reservation_cancelled',
        entityType: 'reservation',
        entityId: new mongoose.Types.ObjectId(),
        userId: user._id,
        description: 'تم إلغاء حجز العميل أحمد صالح',
        metadata: {
          customerName: 'أحمد صالح',
          customerPhone: '0777112233',
          startDate: new Date('2024-01-10'),
          endDate: new Date('2024-01-12'),
          totalPrice: 8000,
          paidAmount: 2000,
          remainingAmount: 6000,
          paymentStatus: 'partial',
          status: 'cancelled',
          propertyTitle: 'استوديو في قسنطينة',
          propertyId: new mongoose.Types.ObjectId(),
          propertyPricePerDay: 4000,
          employerId: null,
          deletedAt: new Date(),
          originalCreatedAt: new Date('2024-01-09'),
          reservationId: new mongoose.Types.ObjectId()
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Test Browser)'
      }
    ];

    // Insert test history entries
    const insertedHistory = await History.insertMany(testHistoryEntries);
    console.log(`Successfully created ${insertedHistory.length} test history entries:`);
    insertedHistory.forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.description} (${new Date(entry.createdAt).toLocaleString('ar-DZ')})`);
    });

  } catch (error) {
    console.error('Error creating test history:', error);
  } finally {
    await mongoose.disconnect();
  }
};

createTestHistory();
