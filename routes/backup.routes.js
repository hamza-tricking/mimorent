const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/role.middleware');
const { sendSuccess, sendError } = require('../utils/response.util');
const { asyncHandler } = require('../middlewares/error.middleware');
const {
  createSystemBackup,
  getAllBackups,
  getBackupById,
  deleteBackup,
  restoreFromBackup
} = require('../scripts/createBackup');

// POST /api/admin/backups - Create new backup
router.post('/backups',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const { description } = req.body;
      const userId = req.user._id;
      
      const backup = await createSystemBackup(userId, description);
      
      sendSuccess(res, 'Backup created successfully', {
        backup: {
          _id: backup._id,
          name: backup.name,
          description: backup.description,
          metadata: backup.metadata,
          createdAt: backup.createdAt
        }
      }, 201);
    } catch (error) {
      console.error('Create backup error:', error);
      sendError(res, 'Failed to create backup', 500, error.message);
    }
  })
);

// GET /api/admin/backups - Get all backups with pagination
router.get('/backups',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      
      const result = await getAllBackups(page, limit);
      
      sendSuccess(res, 'Backups retrieved successfully', result);
    } catch (error) {
      console.error('Get backups error:', error);
      sendError(res, 'Failed to retrieve backups', 500, error.message);
    }
  })
);

// GET /api/admin/backups/:id - Get specific backup
router.get('/backups/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const backupId = req.params.id;
      
      const backup = await getBackupById(backupId);
      
      sendSuccess(res, 'Backup retrieved successfully', { backup });
    } catch (error) {
      console.error('Get backup error:', error);
      if (error.message === 'Backup not found') {
        return sendError(res, 'Backup not found', 404);
      }
      sendError(res, 'Failed to retrieve backup', 500, error.message);
    }
  })
);

// DELETE /api/admin/backups/:id - Delete backup
router.delete('/backups/:id',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const backupId = req.params.id;
      
      const result = await deleteBackup(backupId);
      
      sendSuccess(res, 'Backup deleted successfully', result);
    } catch (error) {
      console.error('Delete backup error:', error);
      if (error.message === 'Backup not found') {
        return sendError(res, 'Backup not found', 404);
      }
      sendError(res, 'Failed to delete backup', 500, error.message);
    }
  })
);

// POST /api/admin/backups/:id/restore - Restore from backup
router.post('/backups/:id/restore',
  auth,
  adminOnly,
  asyncHandler(async (req, res) => {
    try {
      const backupId = req.params.id;
      
      // WARNING: This is a dangerous operation - add confirmation
      const { confirm } = req.body;
      
      if (!confirm || confirm !== 'RESTORE_CONFIRMED') {
        return sendError(res, 'Restore operation must be confirmed', 400);
      }
      
      const result = await restoreFromBackup(backupId);
      
      sendSuccess(res, 'Data restored successfully', result);
    } catch (error) {
      console.error('Restore backup error:', error);
      if (error.message === 'Backup not found') {
        return sendError(res, 'Backup not found', 404);
      }
      sendError(res, 'Failed to restore from backup', 500, error.message);
    }
  })
);

module.exports = router;
