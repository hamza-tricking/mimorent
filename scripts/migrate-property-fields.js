const mongoose = require('mongoose');
const Property = require('../models/property.model');

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mimorent', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const migrateProperties = async () => {
  try {
    console.log('🔄 Starting property field migration...');
    
    // Migration 1: Add showingOnHome field with default value true
    const showingOnHomeResult = await Property.updateMany(
      { showingOnHome: { $exists: false } },
      { $set: { showingOnHome: true } }
    );
    
    console.log(`✅ Updated ${showingOnHomeResult.modifiedCount} properties with showingOnHome field`);
    
    // Migration 2: Add reservedWith field with default value 'day'
    const reservedWithResult = await Property.updateMany(
      { reservedWith: { $exists: false } },
      { $set: { reservedWith: 'day' } }
    );
    
    console.log(`✅ Updated ${reservedWithResult.modifiedCount} properties with reservedWith field`);
    
    // Migration 3: Ensure location field exists (backup migration)
    const locationResult = await Property.updateMany(
      { location: { $exists: false } },
      { $set: { location: 'غير محدد' } }
    );
    
    console.log(`✅ Updated ${locationResult.modifiedCount} properties with location field`);
    
    // Verify migration
    const totalProperties = await Property.countDocuments();
    const propertiesWithShowingOnHome = await Property.countDocuments({ showingOnHome: { $exists: true } });
    const propertiesWithReservedWith = await Property.countDocuments({ reservedWith: { $exists: true } });
    
    console.log('\n📊 Migration Summary:');
    console.log(`Total properties: ${totalProperties}`);
    console.log(`Properties with showingOnHome: ${propertiesWithShowingOnHome}`);
    console.log(`Properties with reservedWith: ${propertiesWithReservedWith}`);
    
    if (propertiesWithShowingOnHome === totalProperties && propertiesWithReservedWith === totalProperties) {
      console.log('\n🎉 Migration completed successfully!');
    } else {
      console.log('\n⚠️ Migration completed with some issues. Check the logs above.');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

// Run migration
migrateProperties();
