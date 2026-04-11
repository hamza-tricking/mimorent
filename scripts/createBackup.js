const mongoose = require('mongoose');
const Property = require('../models/property.model');
const Reservation = require('../models/reservation.model');
const User = require('../models/user.model');
const Office = require('../models/office.model');
const Wilaya = require('../models/wilaya.model');
const Backup = require('../models/backup.model');

/**
 * Create a complete backup of all system data
 * @param {string} userId - ID of the user creating the backup
 * @param {string} description - Optional description for the backup
 * @returns {Promise<Object>} - Created backup document
 */
const createSystemBackup = async (userId, description = null) => {
  try {
    console.log('Starting system backup...');
    
    // Fetch all data from all collections
    const [
      properties,
      reservations,
      users,
      offices,
      wilayas
    ] = await Promise.all([
      Property.find({}).lean(),
      Reservation.find({}).lean(),
      User.find({}).select('-password').lean(),
      Office.find({}).lean(),
      Wilaya.find({}).lean()
    ]);

    console.log('Data fetched:', {
      properties: properties.length,
      reservations: reservations.length,
      users: users.length,
      offices: offices.length,
      wilayas: wilayas.length
    });

    // Calculate backup size
    const backupData = {
      properties,
      reservations,
      users,
      offices,
      wilayas
    };
    
    const dataSize = JSON.stringify(backupData).length;
    const sizeInMB = (dataSize / (1024 * 1024)).toFixed(2);

    // Create backup document
    const backup = new Backup({
      name: `backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`,
      description: description || 'Manual backup created by admin',
      data: backupData,
      metadata: {
        totalProperties: properties.length,
        totalReservations: reservations.length,
        totalUsers: users.length,
        totalOffices: offices.length,
        totalWilayas: wilayas.length,
        backupSize: `${sizeInMB} MB`,
        createdBy: userId
      }
    });

    await backup.save();
    
    console.log('Backup created successfully:', {
      backupId: backup._id,
      name: backup.name,
      size: backup.metadata.backupSize,
      createdAt: backup.createdAt
    });

    return backup;
  } catch (error) {
    console.error('Error creating backup:', error);
    throw error;
  }
};

/**
 * Get all backups with pagination
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Promise<Object>} - Paginated backups
 */
const getAllBackups = async (page = 1, limit = 10) => {
  try {
    const skip = (page - 1) * limit;
    
    const backups = await Backup.find({ isActive: true })
      .populate('metadata.createdBy', 'username firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Backup.countDocuments({ isActive: true });
    
    return {
      backups,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('Error fetching backups:', error);
    throw error;
  }
};

/**
 * Get backup by ID
 * @param {string} backupId - Backup ID
 * @returns {Promise<Object>} - Backup document
 */
const getBackupById = async (backupId) => {
  try {
    const backup = await Backup.findById(backupId)
      .populate('metadata.createdBy', 'username firstName lastName email');
    
    if (!backup) {
      throw new Error('Backup not found');
    }
    
    return backup;
  } catch (error) {
    console.error('Error fetching backup:', error);
    throw error;
  }
};

/**
 * Delete backup by ID (soft delete)
 * @param {string} backupId - Backup ID
 * @returns {Promise<Object>} - Deleted backup info
 */
const deleteBackup = async (backupId) => {
  try {
    const backup = await Backup.findByIdAndUpdate(
      backupId,
      { isActive: false },
      { new: true }
    );
    
    if (!backup) {
      throw new Error('Backup not found');
    }
    
    return { message: 'Backup deleted successfully', backupId };
  } catch (error) {
    console.error('Error deleting backup:', error);
    throw error;
  }
};

/**
 * Restore data from backup (WARNING: This will overwrite existing data)
 * @param {string} backupId - Backup ID
 * @returns {Promise<Object>} - Restore results
 */
const restoreFromBackup = async (backupId) => {
  try {
    const backup = await Backup.findById(backupId);
    
    if (!backup) {
      throw new Error('Backup not found');
    }
    
    console.log('Starting restore from backup:', backup.name);
    
    const restoreResults = {};
    
    // Restore properties
    if (backup.data.properties && backup.data.properties.length > 0) {
      await Property.deleteMany({});
      await Property.insertMany(backup.data.properties);
      restoreResults.properties = backup.data.properties.length;
    }
    
    // Restore reservations
    if (backup.data.reservations && backup.data.reservations.length > 0) {
      await Reservation.deleteMany({});
      await Reservation.insertMany(backup.data.reservations);
      restoreResults.reservations = backup.data.reservations.length;
    }
    
    // Restore users (without passwords)
    if (backup.data.users && backup.data.users.length > 0) {
      await User.deleteMany({});
      await User.insertMany(backup.data.users);
      restoreResults.users = backup.data.users.length;
    }
    
    // Restore offices
    if (backup.data.offices && backup.data.offices.length > 0) {
      await Office.deleteMany({});
      await Office.insertMany(backup.data.offices);
      restoreResults.offices = backup.data.offices.length;
    }
    
    // Restore wilayas
    if (backup.data.wilayas && backup.data.wilayas.length > 0) {
      await Wilaya.deleteMany({});
      await Wilaya.insertMany(backup.data.wilayas);
      restoreResults.wilayas = backup.data.wilayas.length;
    }
    
    console.log('Restore completed:', restoreResults);
    
    return {
      message: 'Data restored successfully',
      backupName: backup.name,
      restored: restoreResults
    };
  } catch (error) {
    console.error('Error restoring from backup:', error);
    throw error;
  }
};

module.exports = {
  createSystemBackup,
  getAllBackups,
  getBackupById,
  deleteBackup,
  restoreFromBackup
};
