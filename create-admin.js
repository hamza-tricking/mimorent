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
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('adminmimo', salt);

    // Create admin user
    const admin = await User.create({
      username: 'mimoadmin',
      password: hashedPassword,
      firstName: 'MIMO',
      lastName: 'Admin',
      email: 'admin@mimo.com',
      role: 'admin',
      isActive: true
    });

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
