const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/user.model');
const { mongodbUri } = require('./config/env');

// Create admin user
const createAdmin = async () => {
  try {
    // Connect to database using the same config as server
    await mongoose.connect(mongodbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB Connected...');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ username: 'mimoadmin' });
    if (existingAdmin) {
      console.log('Updating existing admin user...');
      // Update existing admin with correct password
      existingAdmin.password = 'adminmimo'; // Will be hashed by pre-save hook
      await existingAdmin.save();
      console.log('Admin user updated successfully:');
    } else {
      console.log('Creating new admin user...');
      // Create admin user (password will be hashed automatically by pre-save hook)
      const admin = await User.create({
        username: 'mimoadmin',
        password: 'adminmimo', // Plain text - will be hashed by model pre-save hook
        firstName: 'MIMO',
        lastName: 'Admin',
        email: 'admin@mimo.com',
        role: 'admin',
        isActive: true
      });
      console.log('Admin user created successfully:');
    }

    console.log('Admin user created successfully:');
    console.log('Username: mimoadmin');
    console.log('Password: adminmimo');
    console.log('Role: admin');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
};

// Run the script
createAdmin();
