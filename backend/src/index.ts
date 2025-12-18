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
    origin: (request: Request) => {
      const origin = request.headers.get('origin') || undefined
      if (!origin) return true
      
      const normalized = normalize(origin)
      const allowed = allowedOrigins.map(normalize)

      if (normalized && allowed.includes(normalized)) {
        return true
      }

      console.warn('[CORS] Blocked origin:', origin)
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
app.options('*', ({ set, request }) => {
  try {
    const headers = request?.headers
    let originHeader: string | undefined
    if (headers) {
      if (typeof headers.get === 'function') originHeader = headers.get('origin') || headers.get('Origin') || undefined
      else originHeader = (headers as any).origin || (headers as any).Origin
    }
    
    const normalizedOrigin = normalize(originHeader)
    const allowed = allowedOrigins.map(normalize)

    console.log('[CORS] OPTIONS preflight:', { 
      origin: originHeader, 
      normalized: normalizedOrigin,
      allowed: allowed,
      isAllowed: originHeader && normalizedOrigin && allowed.includes(normalizedOrigin)
    })

    if (originHeader && normalizedOrigin && allowed.includes(normalizedOrigin)) {
      // Set CORS headers using Elysia's correct API
      set.headers['Access-Control-Allow-Origin'] = originHeader
      set.headers['Access-Control-Allow-Credentials'] = 'true'
      
      // Get requested headers from preflight
      let reqHeaders: string | undefined
      if (headers && typeof headers.get === 'function') {
        reqHeaders = headers.get('access-control-request-headers') || headers.get('Access-Control-Request-Headers') || undefined
      } else if (headers) {
        reqHeaders = (headers as any)['access-control-request-headers'] || (headers as any)['Access-Control-Request-Headers']
      }

      set.headers['Access-Control-Allow-Headers'] = reqHeaders || 'Content-Type, Authorization, X-Requested-With, Accept'
      
      // Get requested method
      let reqMethod: string | undefined
      if (headers && typeof headers.get === 'function') {
        reqMethod = headers.get('access-control-request-method') || headers.get('Access-Control-Request-Method') || undefined
      } else if (headers) {
        reqMethod = (headers as any)['access-control-request-method'] || (headers as any)['Access-Control-Request-Method']
      }

      set.headers['Access-Control-Allow-Methods'] = reqMethod || 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
      
      console.log('[CORS] ✅ Allowed preflight for:', originHeader)
    } else {
      console.warn('[CORS] ❌ Blocked preflight origin:', originHeader)
    }
  } catch (e) {
    console.error('[CORS] OPTIONS handler error:', e)
  }

  set.status = 204
  return null
})

/* -------------------------------------------------------------------------- */
/*                              Middleware                                    */
/* -------------------------------------------------------------------------- */

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