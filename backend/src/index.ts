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

import { startAlertScheduler, stopAlertScheduler } from './services/alertScheduler'
import { startCalendarSyncScheduler, stopCalendarSyncScheduler } from './services/calendarSync'

const app = new Elysia()

/* -------------------- lifecycle -------------------- */

app.onStart(async () => {
  await connectDB()
  await initRedis()

  setupEventMonitoring()
  startAlertScheduler()
  startCalendarSyncScheduler()

  console.log('✅ All services initialized')
})

/* -------------------- middleware -------------------- */

app
  .use(
    cors({
      origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      credentials: true
    })
  )
  .use(
    jwt({
      name: 'jwt',
      secret: process.env.JWT_SECRET!
    })
  )
  .use(bearer())

/* -------------------- core routes -------------------- */

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

/* -------------------- plugins -------------------- */

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

/* -------------------- errors -------------------- */

app.onError(({ code, error, set }) => {
  if (code === 'NOT_FOUND') {
    set.status = 404
    return { error: 'Route not found' }
  }

  console.error(error)
  set.status = 500
  return { error: 'Internal Server Error' }
})

/* -------------------- shutdown -------------------- */

const shutdown = async () => {
  stopAlertScheduler()
  stopCalendarSyncScheduler()
  await disconnectDB()
  await closeRedis()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

/* -------------------- listen -------------------- */

app.listen(3001)
console.log('🦊 Elysia running at http://localhost:3001')