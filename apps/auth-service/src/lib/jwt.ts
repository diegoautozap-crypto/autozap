import jwt from 'jsonwebtoken'
import { createHash, randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import type { JwtPayload, UserRole } from '@autozap/types'

const ACCESS_SECRET = process.env.JWT_SECRET!
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!

// Access token: 1 hora — renovado silenciosamente pelo frontend
const ACCESS_EXPIRES = '1h'

// Refresh token: 30 dias — se ficar 30 dias sem abrir o sistema, faz login de novo
const REFRESH_EXPIRES_DAYS = 30

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('Missing JWT_SECRET or JWT_REFRESH_SECRET env vars')
}

// ─── Access Token ─────────────────────────────────────────────────────────────

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES })
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload
}

// ─── Refresh Token ────────────────────────────────────────────────────────────

export interface RefreshTokenPayload {
  userId: string
  tenantId: string
  role: UserRole
  family: string
}

export function generateRefreshToken(): string {
  return randomBytes(64).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function refreshExpiresAt(): Date {
  const d = new Date()
  d.setDate(d.getDate() + REFRESH_EXPIRES_DAYS)
  return d
}