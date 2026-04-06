import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/auth.routes'
import { errorHandler } from './middleware/auth.middleware'
import { logger } from './lib/logger'

const app = express()
const PORT = process.env.PORT || 3001

// ─── Security Middleware ──────────────────────────────────────────────────────

app.set('trust proxy', 1)

app.use(helmet())

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests, try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
})

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many registration attempts, try again later' } },
})

const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many attempts' } },
})

// ─── Body Parsing ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '100kb' }))
app.use(express.urlencoded({ extended: true, limit: '100kb' }))

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() })
})

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/auth/register', registerLimiter)
app.use('/auth/forgot-password', passwordLimiter)
app.use('/auth/reset-password', passwordLimiter)
app.use('/auth', authLimiter, authRoutes)

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } })
})

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use(errorHandler)

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`auth-service running on port ${PORT}`, { env: process.env.NODE_ENV })
})

export default app