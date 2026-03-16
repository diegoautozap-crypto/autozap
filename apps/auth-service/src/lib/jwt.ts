import jwt from 'jsonwebtoken'
import { createHash, randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import type { JwtPayload, UserRole } from '@autozap/types'

const ACCESS_SECRET = process.env.JWT_SECRET!
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!
const ACCESS_EXPIRES = '15m'
const REFRESH_EXPIRES = '30d'

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
// Refresh tokens are opaque random strings stored hashed in the DB.
// We use token families to detect reuse (theft detection).

export interface RefreshTokenPayload {
  userId: string
  tenantId: string
  role: UserRole
  family: string // UUID — all rotations of the same token share a family
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
  d.setDate(d.getDate() + 30)
  return d
}
