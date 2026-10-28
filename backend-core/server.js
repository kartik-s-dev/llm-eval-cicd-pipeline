import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
dotenv.config();

import { signup, login, forgotPassword } from './authentication/authController.js';
import { runSuiteOrchestrator } from './authentication/evalController.js';
import { getDashboardMetrics, getEvaluationDetails } from './dashboard/dashboardController.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Recent server log lines, kept in memory (lost when the server restarts)
global.liveSystemLogs = global.liveSystemLogs || [
  `[${new Date().toLocaleTimeString()}] INFO: System Gateway Initialized.`
];

// CORS & Middleware Config
app.use(cors({ origin: '*' }));
app.use(express.json());

// Render runs behind one proxy, so trust 1 hop to see the real client IP
app.set('trust proxy', 1);

// Basic rate limit for the evaluation route (60 requests per 15 min per IP)
const evalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Try again later." }
});

// 1. Authentication Routes
app.post('/api/auth/signup', signup);
app.post('/api/auth/login', login);
app.post('/api/auth/forgot-password', forgotPassword);

// 2. Evaluation Run Route
app.post('/api/eval/run', evalLimiter, (req, res, next) => {
  const timestamp = new Date().toLocaleTimeString();
  global.liveSystemLogs.push(`[${timestamp}] EVALUATION_RUN: Executing test suite for prompt...`);
  if (global.liveSystemLogs.length > 20) global.liveSystemLogs.shift();
  runSuiteOrchestrator(req, res, next);
});

// 3. Dashboard Analytics & Metrics Routes
app.get('/api/dashboard/metrics', getDashboardMetrics);
app.get('/api/dashboard/evaluation-details', getEvaluationDetails);

// 4. Recent server log lines
app.get('/api/v1/logs/stream', (req, res) => {
  return res.status(200).json({
    success: true,
    logs: global.liveSystemLogs
  });
});

// Gateway Readiness Status Check
app.get('/api/v1/system/status', (req, res) => {
  res.status(200).json({
    success: true,
    gateway: "ONLINE",
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Gateway online on port ${PORT}`);
});