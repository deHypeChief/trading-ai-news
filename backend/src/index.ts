import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import jwt from '@elysiajs/jwt'
import bearer from '@elysiajs/bearer'
import 'dotenv/config'

import { connectDB, disconnectDB } from './config/database'
import { initRedis, closeRedis } from './config/redis'

import { authRoutes } from './routes/auth'
import { calendarRoutes } from './routes/calendar'
import { alertRoutes } from './routes/alerts'
import { userRoutes } from './routes/users'
import { debugRoutes } from './routes/debug'
import { paymentsRouter } from './routes/payments'
import { websocketRoutes, setupEventMonitoring } from './services/websocket'
import { rateLimiter } from './middleware/rateLimiter'

import { startAlertScheduler, stopAlertScheduler } from './services/alertScheduler'
import { startCalendarSyncScheduler, stopCalendarSyncScheduler } from './services/calendarSync'
import { allowedOrigins } from './config/cors.config'
import { GoogleGenAI } from '@google/genai'


const app = new Elysia()


app.onStart(async () => {
  await connectDB()
  await initRedis()

  setupEventMonitoring()
  startAlertScheduler()
  startCalendarSyncScheduler()

  console.log('✅ All services initialized')
})

  // CORS - allow all origins for simplicity
  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    // exposedHeaders: ["Set-Cookie"]
  }))

// Auth and rate limiting
app
  .use(
    jwt({
      name: 'jwt',
      secret: process.env.JWT_SECRET!
    })
  )
  .use(bearer())
  .use(rateLimiter())

app
  .get('/', () => ({
    status: 'ok',
    message: 'Smart Money Calendar API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  }))
  .get('/api/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString()
  }))


app
  .use(websocketRoutes)
  .use(paymentsRouter)
  .group('/api', app =>
    app
      .use(authRoutes)
      .use(calendarRoutes)
      .use(alertRoutes)
      .use(userRoutes)
      .use(debugRoutes)
  )


app.onError(({ code, error, set }) => {
  if (code === 'NOT_FOUND') {
    set.status = 404
    return { error: 'Route not found' }
  }

  console.error(error)
  set.status = 500
  return { error: 'Internal Server Error' }
})


const shutdown = async () => {
  stopAlertScheduler()
  stopCalendarSyncScheduler()
  await disconnectDB()
  await closeRedis()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)


app.listen(Bun.env.PORT || 3001)
console.log(`🦊 Elysia running at http://localhost:${Bun.env.PORT || 3001}`)