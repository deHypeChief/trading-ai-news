import { Elysia } from 'elysia'
import cors from '@elysiajs/cors'
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

/* -------------------------------------------------------------------------- */
/*                                App setup                                   */
/* -------------------------------------------------------------------------- */

const app = new Elysia()

/* -------------------------------------------------------------------------- */
/*                               Lifecycle                                    */
/* -------------------------------------------------------------------------- */

app.onStart(async () => {
  await connectDB()
  await initRedis()

  setupEventMonitoring()
  startAlertScheduler()
  startCalendarSyncScheduler()

  console.log('✅ All services initialized')
})

/* -------------------------------------------------------------------------- */
/*                                CORS                                         */
/* -------------------------------------------------------------------------- */

const allowedOrigins = (
  process.env.FRONTEND_URLS ||
  process.env.FRONTEND_URL ||
  'http://localhost:3000'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const normalize = (url: string) => url.replace(/\/$/, '')

console.log('[CORS] Allowed origins:', allowedOrigins)

app.use(
  cors({
    origin: (incomingOrigin) => {
      // Allow server-to-server or curl requests
      if (!incomingOrigin) return true

      const origin = normalize(incomingOrigin)
      const allowed = allowedOrigins.map(normalize)

      if (allowed.includes(origin)) {
        // Must echo exact origin when credentials = true
        return origin
      }

      console.warn('[CORS] Blocked origin:', incomingOrigin)
      return false
    },
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept'
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  })
)

// Ensure preflight requests never hit auth or rate-limits
app.options('*', ({ set }) => {
  set.status = 204
  return null
})

/* -------------------------------------------------------------------------- */
/*                              Middleware                                    */
/* -------------------------------------------------------------------------- */

app
  .use(
    jwt({
      name: 'jwt',
      secret: process.env.JWT_SECRET!
    })
  )
  .use(bearer())
  .use(rateLimiter())

/* -------------------------------------------------------------------------- */
/*                                 Core routes                                 */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*                                Plugins                                     */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*                                  Errors                                    */
/* -------------------------------------------------------------------------- */

app.onError(({ code, error, set }) => {
  if (code === 'NOT_FOUND') {
    set.status = 404
    return { error: 'Route not found' }
  }

  console.error(error)
  set.status = 500
  return { error: 'Internal Server Error' }
})

/* -------------------------------------------------------------------------- */
/*                                 Shutdown                                   */
/* -------------------------------------------------------------------------- */

const shutdown = async () => {
  stopAlertScheduler()
  stopCalendarSyncScheduler()
  await disconnectDB()
  await closeRedis()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

/* -------------------------------------------------------------------------- */
/*                                  Listen                                    */
/* -------------------------------------------------------------------------- */

app.listen(3001)
console.log('🦊 Elysia running at http://localhost:3001')
