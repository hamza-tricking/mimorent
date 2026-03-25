const mongoose = require('mongoose');
const User = require('./models/user.model');
require('dotenv').config();

async function createSousAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mimorent');
    console.log('Connected to MongoDB');
    
    // Check if sousadmin user already exists
    const existingUser = await User.findOne({ username: 'sousadmin' });
    if (existingUser) {
      console.log('SousAdmin user already exists');
      process.exit(0);
    }
    
    // Create sousAdmin user
    const sousAdmin = new User({
      username: 'sousadmin',
      password: 'adminsous',
      firstName: 'Sous',
      lastName: 'Admin',
      email: 'sousadmin@mimorent.com',
      role: 'sousAdmin',
      isActive: true
    });
    
    await sousAdmin.save();
    console.log('SousAdmin user created successfully');
    console.log('Username: sousadmin');
    console.log('Password: adminsous');
    console.log('Role: sousAdmin');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating SousAdmin user:', error);
    process.exit(1);
  }
}

createSousAdmin();
