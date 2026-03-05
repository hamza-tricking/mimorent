const express = require('express');
const router = express.Router();

console.log('Notification routes loaded successfully');

// Main notifications route
router.get('/', (req, res) => {
  console.log('MAIN NOTIFICATION ROUTE CALLED!!!');
  res.json({
    success: true,
    data: [],
    message: 'Notification routes are working!'
  });
});

// Simple test route
router.get('/test', (req, res) => {
  console.log('TEST ROUTE CALLED!!!');
  res.json({
    success: true,
    message: 'Test route is working!'
  });
});

module.exports = router;
