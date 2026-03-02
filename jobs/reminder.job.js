const cron = require('node-cron');
const ReminderService = require('../services/reminder.service');

class ReminderJob {
  constructor() {
    this.isRunning = false;
    this.job = null;
  }
  
  // Start the reminder processing job
  start() {
    if (this.isRunning) {
      console.log('⚠️ Reminder job is already running');
      return;
    }
    
    console.log('🚀 Starting reminder processing job...');
    
    // Schedule to run every 1 minute for testing
    this.job = cron.schedule('* * * * *', async () => {
      if (this.isRunning) {
        console.log('⏳ Previous reminder job still running, forcing reset...');
        this.isRunning = false; // Force reset if stuck
      }
      
      this.isRunning = true;
      
      try {
        console.log('⏰ Running reminder job at:', new Date().toISOString());
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Job timeout')), 30000); // 30 seconds timeout
        });
        
        const result = await Promise.race([
          ReminderService.processDueReminders(),
          timeoutPromise
        ]);
        
        if (result.success) {
          console.log(`✅ Reminder job completed: ${result.processed}/${result.total} reminders processed`);
          
          // Log details for processed reminders
          if (result.reminders.length > 0) {
            console.log('📋 Processed reminders:');
            result.reminders.forEach(reminder => {
              console.log(`  - Reservation ${reminder.reservationId._id}: ${reminder.message}`);
            });
          }
        } else {
          console.error('❌ Reminder job failed:', result.error);
        }
      } catch (error) {
        console.error('❌ Critical error in reminder job:', error);
      } finally {
        this.isRunning = false;
        console.log('🔄 Job completed, isRunning set to false');
      }
    }, {
      scheduled: true,
      timezone: 'Africa/Algiers' // Use Africa/Algiers to match reminder storage
    });
    
    this.isRunning = true;
    console.log('✅ Reminder job started successfully');
  }
  
  // Stop the reminder processing job
  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      this.isRunning = false;
      console.log('🛑 Reminder job stopped');
    }
  }
  
  // Run job manually (for testing)
  async runOnce() {
    if (this.isRunning) {
      console.log('⚠️ Job is already running');
      return;
    }
    
    this.isRunning = true;
    
    try {
      console.log('🔧 Running reminder job manually...');
      const result = await ReminderService.processDueReminders();
      
      if (result.success) {
        console.log(`✅ Manual reminder job completed: ${result.processed}/${result.total} reminders processed`);
      } else {
        console.error('❌ Manual reminder job failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Critical error in manual reminder job:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  
  // Get job status
  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.job !== null,
      nextRun: this.job ? this.job.nextDates().toISOString() : null
    };
  }
}

// Create singleton instance
const reminderJob = new ReminderJob();

// Auto-start if not in test environment
if (process.env.NODE_ENV !== 'test') {
  reminderJob.start();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down reminder job...');
  reminderJob.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down reminder job...');
  reminderJob.stop();
  process.exit(0);
});

module.exports = reminderJob;
