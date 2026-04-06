import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ENCRYPTION_KEY = process.env.TWO_FACTOR_ENCRYPTION_KEY!
if (!ENCRYPTION_KEY) throw new Error('Missing TWO_FACTOR_ENCRYPTION_KEY env var')

// Derive a 32-byte key from the env secret
const KEY = scryptSync(ENCRYPTION_KEY, 'autozap-2fa-salt', 32)

authenticator.options = { window: 1 } // allow 1 step tolerance (±30s)

// ─── Encrypt / Decrypt secret stored in DB ───────────────────────────────────

export function encryptSecret(secret: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(encrypted: string): string {
  const parts = encrypted.split(':')
  // Suporta formato antigo (CBC: iv:data) e novo (GCM: iv:tag:data)
  if (parts.length === 2) {
    const [ivHex, dataHex] = parts
    const iv = Buffer.from(ivHex, 'hex')
    const data = Buffer.from(dataHex, 'hex')
    const decipher = createDecipheriv('aes-256-cbc', KEY, iv)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  }
  const [ivHex, tagHex, dataHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

// ─── Generate setup ───────────────────────────────────────────────────────────

export async function generateTwoFactorSetup(email: string): Promise<{
  secret: string
  qrCodeUrl: string
  encryptedSecret: string
}> {
  const secret = authenticator.generateSecret(32)
  const otpauthUrl = authenticator.keyuri(email, 'AutoZap', secret)
  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl)
  const encryptedSecret = encryptSecret(secret)

  return { secret, qrCodeUrl, encryptedSecret }
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  const secret = decryptSecret(encryptedSecret)
  return authenticator.verify({ token: code, secret })
}
