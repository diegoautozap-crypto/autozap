import { createDecipheriv, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY env var is not set')
  return scryptSync(raw, 'autozap-salt', KEY_LENGTH)
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext.includes(':')) return ciphertext
  const parts = ciphertext.split(':')
  if (parts.length !== 3) return ciphertext
  try {
    const key = getKey()
    const iv = Buffer.from(parts[0], 'hex')
    const tag = Buffer.from(parts[1], 'hex')
    const encrypted = Buffer.from(parts[2], 'hex')
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(encrypted) + decipher.final('utf8')
  } catch {
    return ciphertext
  }
}

export function decryptCredentials(credentials: Record<string, string>): Record<string, string> {
  if (!process.env.ENCRYPTION_KEY) return credentials
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(credentials)) {
    result[key] = value ? decrypt(value) : value
  }
  return result
}
