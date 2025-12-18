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
/*                                CORS (FIRST)                                */
/* -------------------------------------------------------------------------- */

const allowedOrigins = (
  process.env.FRONTEND_URLS ||
  process.env.FRONTEND_URL ||
  'http://localhost:3000'
)
  .split(',')
  .map((s) => String(s || '').trim())
  .filter(Boolean)

const normalize = (url: any) => {
  try {
    return String(url).replace(/\/$/, '')
  } catch (e) {
    console.warn('[CORS] normalize failed for', url, e)
    return ''
  }
}

console.log('[CORS] Allowed origins:', allowedOrigins.map(normalize))

// CORS MUST be registered before any auth / rate-limit middleware
app.use(
  cors({
    origin: (incomingOrigin) => {
      // Accept either a string origin or a Request-like object (e.g., BunRequest)
      if (!incomingOrigin) return true

      const extractOrigin = (inc: any): string | undefined => {
        if (!inc) return undefined
        if (typeof inc === 'string') return inc

        // Request-like: headers.get exists
        if (inc.headers && typeof inc.headers.get === 'function') {
          return inc.headers.get('origin') || inc.headers.get('Origin') || undefined
        }

        // headers as plain object
        if (inc.headers && typeof inc.headers === 'object') {
          return inc.headers.origin || inc.headers.Origin || undefined
        }

        // url property (parse origin)
        if (typeof inc.url === 'string') {
          try {
            return new URL(inc.url).origin
          } catch (e) {
            return undefined
          }
        }

        if (typeof inc.origin === 'string') return inc.origin
        return undefined
      }

      const incoming = extractOrigin(incomingOrigin)
      const origin = normalize(incoming)
      const allowed = allowedOrigins.map(normalize)

      if (origin && allowed.includes(origin)) {
        // return boolean true to indicate the origin is allowed
        return true
      }

      if (typeof incomingOrigin === 'object') {
        console.warn('[CORS] Blocked origin (request-like):', incomingOrigin)
      } else {
        console.warn('[CORS] Blocked origin:', incomingOrigin)
      }

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

// Hard stop for preflight — never allow OPTIONS to reach auth or rate limiter
// Also log a small snapshot for short-lived diagnostics to confirm preflights reach the server
app.options('*', (ctx) => {
  try {
    const headers = (ctx as any).request?.headers
    let originHeader: string | undefined
    if (headers) {
      if (typeof headers.get === 'function') originHeader = headers.get('origin') || headers.get('Origin')
      else originHeader = headers.origin || headers.Origin
    }
    console.log('[CORS] OPTIONS preflight:', { origin: originHeader })
  } catch (e) {
    console.warn('[CORS] OPTIONS preflight log failed', e)
  }

  (ctx as any).set.status = 204
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