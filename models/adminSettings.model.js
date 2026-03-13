const mongoose = require('mongoose');

const adminSettingsSchema = new mongoose.Schema({
  // Auto-accept orders setting
  autoAcceptOrders: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create a singleton - there should only be one settings document
adminSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  
  if (!settings) {
    // Create default settings if none exist
    settings = new this({
      autoAcceptOrders: false
    });
    await settings.save();
  }
  
  return settings;
};

adminSettingsSchema.statics.updateAutoAcceptOrders = async function(autoAccept) {
  let settings = await this.getSettings();
  
  settings.autoAcceptOrders = autoAccept;
  await settings.save();
  return settings;
};

module.exports = mongoose.model('AdminSettings', adminSettingsSchema);
