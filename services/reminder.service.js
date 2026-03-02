const Reminder = require('../models/reminder.model');
const Reservation = require('../models/reservation.model');

class ReminderService {
  // Process due reminders and send notifications
  static async processDueReminders() {
    try {
      console.log('🔔 Processing due reminders...');
      
      const dueReminders = await Reminder.findDueReminders();
      console.log(`Found ${dueReminders.length} due reminders`);
      
      const processedReminders = [];
      
      for (const reminder of dueReminders) {
        try {
          // Send notification through configured channels
          await this.sendNotification(reminder);
          
          // Mark reminder as sent
          await reminder.markAsSent();
          
          processedReminders.push(reminder);
          
          console.log(`✅ Reminder sent for reservation ${reminder.reservationId._id}`);
        } catch (error) {
          console.error(`❌ Failed to send reminder for reservation ${reminder.reservationId._id}:`, error);
          
          // Mark as inactive if critical error
          if (error.code === 'CRITICAL') {
            reminder.isActive = false;
            await reminder.save();
          }
        }
      }
      
      return {
        success: true,
        processed: processedReminders.length,
        total: dueReminders.length,
        reminders: processedReminders
      };
    } catch (error) {
      console.error('❌ Error processing due reminders:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Send notification through multiple channels
  static async sendNotification(reminder) {
    const channels = reminder.notificationChannels || ['system'];
    const results = [];
    
    for (const channel of channels) {
      try {
        const result = await this.sendThroughChannel(reminder, channel);
        results.push({ channel, success: true, result });
      } catch (error) {
        console.error(`Failed to send ${channel} notification:`, error);
        results.push({ channel, success: false, error: error.message });
      }
    }
    
    // Check if at least one channel succeeded
    const hasSuccess = results.some(r => r.success);
    if (!hasSuccess) {
      throw new Error('All notification channels failed');
    }
    
    return results;
  }
  
  // Send notification through specific channel
  static async sendThroughChannel(reminder, channel) {
    const { reservationId, propertyId, message, metadata } = reminder;
    
    switch (channel) {
      case 'system':
        return await this.sendSystemNotification(reminder);
      case 'email':
        return await this.sendEmailNotification(reminder);
      case 'sms':
        return await this.sendSMSNotification(reminder);
      case 'push':
        return await this.sendPushNotification(reminder);
      default:
        throw new Error(`Unknown notification channel: ${channel}`);
    }
  }
  
  // System notification (in-app notification)
  static async sendSystemNotification(reminder) {
    // Create system notification record
    const notification = {
      type: 'reminder',
      title: 'تذكير بالحجز',
      message: reminder.message,
      reservationId: reminder.reservationId._id,
      propertyId: reminder.propertyId._id,
      userId: reminder.createdBy._id,
      metadata: {
        reminderId: reminder._id,
        customerName: reminder.metadata.customerName,
        propertyTitle: reminder.metadata.propertyTitle,
        reminderType: reminder.reminderType,
        reminderDateTime: reminder.calculatedReminderDate
      },
      createdAt: new Date()
    };
    
    // Here you would save to your notifications collection
    // For now, we'll just log it
    console.log('📱 System notification created:', notification);
    
    return { success: true, notificationId: reminder._id };
  }
  
  // Email notification
  static async sendEmailNotification(reminder) {
    const { metadata, message } = reminder;
    
    const emailData = {
      to: reminder.createdBy.email, // Admin email
      subject: 'تذكير بالحجز - ' + metadata.propertyTitle,
      text: `
        تذكير بالحجز
        
        العميل: ${metadata.customerName}
        هاتف: ${metadata.customerPhone}
        العقار: ${metadata.propertyTitle}
        الموقع: ${metadata.propertyLocation}
        تاريخ البدء: ${new Date(metadata.reservationStartDate).toLocaleDateString('ar-DZ')}
        تاريخ الانتهاء: ${new Date(metadata.reservationEndDate).toLocaleDateString('ar-DZ')}
        
        الرسالة: ${message}
        
        تاريخ التذكير: ${new Date(reminder.calculatedReminderDate).toLocaleDateString('ar-DZ')}
      `,
      html: `
        <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
          <h2 style="color: #333;">تذكير بالحجز</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>العميل:</strong> ${metadata.customerName}</p>
            <p><strong>الهاتف:</strong> ${metadata.customerPhone}</p>
            <p><strong>العقار:</strong> ${metadata.propertyTitle}</p>
            <p><strong>الموقع:</strong> ${metadata.propertyLocation}</p>
            <p><strong>تاريخ البدء:</strong> ${new Date(metadata.reservationStartDate).toLocaleDateString('ar-DZ')}</p>
            <p><strong>تاريخ الانتهاء:</strong> ${new Date(metadata.reservationEndDate).toLocaleDateString('ar-DZ')}</p>
          </div>
          <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border: 1px solid #ffeaa7;">
            <h3 style="color: #856404; margin-top: 0;">الرسالة:</h3>
            <p>${message}</p>
          </div>
          <p style="color: #666; font-size: 12px; margin-top: 20px;">
            تاريخ التذكير: ${new Date(reminder.calculatedReminderDate).toLocaleDateString('ar-DZ')}
          </p>
        </div>
      `
    };
    
    // Here you would integrate with your email service (SendGrid, Nodemailer, etc.)
    console.log('📧 Email notification prepared:', emailData.subject);
    
    // Simulate email sending
    return { success: true, messageId: 'email_' + Date.now() };
  }
  
  // SMS notification
  static async sendSMSNotification(reminder) {
    const { metadata, message } = reminder;
    
    const smsData = {
      to: metadata.customerPhone, // Customer phone
      text: `تذكير بالحجز: ${metadata.propertyTitle} - ${message}`
    };
    
    // Here you would integrate with your SMS service (Twilio, etc.)
    console.log('📱 SMS notification prepared:', smsData);
    
    // Simulate SMS sending
    return { success: true, messageId: 'sms_' + Date.now() };
  }
  
  // Push notification
  static async sendPushNotification(reminder) {
    const { metadata, message } = reminder;
    
    const pushData = {
      title: 'تذكير بالحجز',
      body: message,
      data: {
        type: 'reminder',
        reservationId: reminder.reservationId._id,
        propertyId: reminder.propertyId._id,
        reminderId: reminder._id
      },
      // Target users (admin users)
      targetUsers: [reminder.createdBy._id]
    };
    
    // Here you would integrate with your push notification service (Firebase, OneSignal, etc.)
    console.log('🔔 Push notification prepared:', pushData);
    
    // Simulate push notification sending
    return { success: true, messageId: 'push_' + Date.now() };
  }
  
  // Create reminder for reservation (helper method)
  static async createReminderForReservation(reservationId, reminderData, userId) {
    try {
      const reminder = await Reminder.createForReservation(
        { reservationId },
        reminderData,
        userId
      );
      
      await reminder.populate('reservationId propertyId createdBy', 'title customerName customerPhone firstName lastName');
      
      return {
        success: true,
        message: 'Reminder created successfully',
        data: { reminder }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create reminder',
        error: error.message
      };
    }
  }
  
  // Get upcoming reminders for dashboard
  static async getUpcomingReminders(userId, limit = 10) {
    try {
      const reminders = await Reminder.find({
        createdBy: userId,
        status: 'pending',
        isActive: true,
        reminderDateTime: { $gte: new Date() }
      })
      .populate('reservationId propertyId', 'title customerName customerPhone')
      .sort({ reminderDateTime: 1 })
      .limit(limit);
      
      return {
        success: true,
        data: { reminders }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch upcoming reminders',
        error: error.message
      };
    }
  }
  
  // Schedule reminder (cron job helper)
  static scheduleReminderProcessing() {
    // This would be used with a cron job scheduler
    // Example: Run every hour
    console.log('⏰ Reminder processing scheduled');
    
    // In a real implementation, you would use node-cron or similar:
    // cron.schedule('0 * * * *', async () => {
    //   await this.processDueReminders();
    // });
  }
}

module.exports = ReminderService;
