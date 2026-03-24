import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const TAG_LENGTH = 16

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY env var is not set')
  // Deriva 32 bytes da chave via scrypt — aceita qualquer tamanho de string
  return scryptSync(raw, 'autozap-salt', KEY_LENGTH)
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Formato: iv(hex):tag(hex):ciphertext(hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  // Se não estiver no formato esperado, retorna como está (credenciais antigas não criptografadas)
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
    // Se falhar na decriptação, retorna o valor original (compatibilidade)
    return ciphertext
  }
}

export function encryptCredentials(credentials: Record<string, string>): Record<string, string> {
  if (!process.env.ENCRYPTION_KEY) return credentials
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(credentials)) {
    result[key] = value ? encrypt(value) : value
  }
  return result
}

export function decryptCredentials(credentials: Record<string, string>): Record<string, string> {
  if (!process.env.ENCRYPTION_KEY) return credentials
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(credentials)) {
    result[key] = value ? decrypt(value) : value
  }
  return result
}
