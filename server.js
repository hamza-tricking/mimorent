const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { port, nodeEnv, frontendUrl, rateLimitWindowMs, rateLimitMaxRequests } = require('./config/env');
const connectDB = require('./config/database');
const { errorHandler, notFound } = require('./middlewares/error.middleware');

const app = express();

// Trust proxy for rate limiting when behind reverse proxy
app.set('trust proxy', 1);

connectDB();

app.use(helmet());

app.use(cors({
  origin: ['http://localhost:3000', 'https://dmtart.pro/mimorent/', 'https://mimorent.vercel.app', 'https://mimorent-5xzh81cri-hamza-trickings-projects.vercel.app'],
  credentials: true
}));

const limiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMaxRequests,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// More lenient rate limit for admin routes
const adminLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 300, // 300 requests per minute
  message: {
    success: false,
    message: 'Too many admin requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);
app.use('/api/admin', adminLimiter);

if (nodeEnv === 'development') {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Mimorent API Server is running',
    version: '1.0.0',
    environment: nodeEnv,
    timestamp: new Date().toISOString()
  });
});

app.get('/mimorent', (req, res) => {
  res.send('Hello from Mimorent');
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Health Check',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/admin', require('./routes/financial.routes'));
app.use('/api/admin', require('./routes/reminder.routes'));
console.log('Notification routes registered');
app.use('/api/employer', require('./routes/employer.routes'));
app.use('/api/employer/notifications', require('./routes/employer.notification.routes'));
app.use('/api', require('./routes/public.routes'));

// Start reminder job
require('./jobs/reminder.job');

app.use(notFound);
app.use(errorHandler);

const server = app.listen(port, () => {
  console.log(`Server running in ${nodeEnv} mode on port ${port}`);
});

process.on('unhandledRejection', (err, promise) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => {
    process.exit(1);
  });
});

process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

module.exports = app;
