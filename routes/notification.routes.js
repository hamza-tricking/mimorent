const express = require('express');
const router = express.Router();

console.log('Notification routes loaded successfully');

// Simple test route
router.get('/test', (req, res) => {
  console.log('TEST ROUTE CALLED!!!');
  res.json({
    success: true,
    message: 'Test route is working!'
  });
});

module.exports = router;
