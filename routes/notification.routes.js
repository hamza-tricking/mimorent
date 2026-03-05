const express = require('express');
const router = express.Router();

console.log('Notification routes loaded successfully');

// Main notifications route
router.get('/', (req, res) => {
  console.log('MAIN NOTIFICATION ROUTE CALLED!!!');
  console.log('Request path:', req.path);
  console.log('Request method:', req.method);
  console.log('Request URL:', req.originalUrl);
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

// Debug: Print all registered routes
console.log('Registered notification routes:');
router.stack.forEach((r) => {
  if (r.route && r.route.path) {
    console.log(`  ${Object.keys(r.route.methods).join(', ').toUpperCase()} ${r.route.path}`);
  }
});

module.exports = router;
