import { Elysia } from 'elysia';
import cors from '@elysiajs/cors';
import jwt from '@elysiajs/jwt';
import bearer from '@elysiajs/bearer';
import 'dotenv/config';

import { connectDB, disconnectDB } from './config/database';
import { initRedis, closeRedis } from './config/redis';
import { authRoutes } from './routes/auth';
import { calendarRoutes } from './routes/calendar';
import { alertRoutes } from './routes/alerts';
import { userRoutes } from './routes/users';
import { debugRoutes } from './routes/debug';
import { websocketRoutes, setupEventMonitoring } from './services/websocket';
import { startAlertScheduler, stopAlertScheduler } from './services/alertScheduler';
import { startCalendarSyncScheduler, stopCalendarSyncScheduler } from './services/calendarSync';

const app = new Elysia();

// Initialize databases
let isInitialized = false;

const initializeApp = async () => {
  if (isInitialized) return;

  try {
    // Connect to MongoDB
    await connectDB();

    // Initialize Redis
    await initRedis();

    // Setup WebSocket event monitoring
    setupEventMonitoring();

    // Start alert scheduler
    startAlertScheduler();

    // Start calendar sync scheduler
    startCalendarSyncScheduler();

    isInitialized = true;
    console.log('✅ All services initialized');
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
};

// Middleware
app
  .use(
    cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    })
  )
  .use(
    jwt({
      name: 'jwt',
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    })
  )
  .use(bearer())
  .onStart(initializeApp);

// Root/Health check
app.get('/', () => {
  return { 
    status: 'ok', 
    message: 'Smart Money Calendar API',
    version: '1.0.0',
    timestamp: new Date().toISOString() 
  };
});

app.get('/api/health', () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Auth routes
app.use(websocketRoutes);
app.group('/api', (app) => app.use(authRoutes).use(calendarRoutes).use(alertRoutes).use(userRoutes).use(debugRoutes));

// 404 handler
app.onError(({ code, error, set }) => {
  if (code === 'NOT_FOUND') {
    set.status = 404;
    return { error: 'Route not found', statusCode: 404 };
  }

  console.error('Error:', error);
  set.status = 500;
  return {
    statusCode: 500,
    message: 'Internal Server Error',
    error: error.message,
  };
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('🛑 Shutting down gracefully...');
  try {
    stopAlertScheduler();
    stopCalendarSyncScheduler();
    await disconnectDB();
    await closeRedis();
    process.exit(0);
  } catch (error) {
    console.error('Shutdown error:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const PORT = parseInt(process.env.PORT || '3001');
app.listen(PORT);

console.log(
  `🦊 Elysia is running at http://localhost:${PORT}`
);

