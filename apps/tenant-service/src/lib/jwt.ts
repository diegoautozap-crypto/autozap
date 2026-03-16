import jwt from 'jsonwebtoken'
import type { JwtPayload } from '@autozap/types'

const ACCESS_SECRET = process.env.JWT_SECRET!
if (!ACCESS_SECRET) throw new Error('Missing JWT_SECRET env var')

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload
}
