import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashPassword, comparePassword, hashToken, generateRefreshToken } from '../lib/jwt'
import { verifyTotpCode, generateTwoFactorSetup } from '../lib/totp'
import { slugify, normalizePhone, isValidPhoneNumber } from '@autozap/utils'

// ─── JWT / Password Tests ─────────────────────────────────────────────────────

describe('password hashing', () => {
  it('hashes and verifies a password correctly', async () => {
    const password = 'MySecurePass1'
    const hash = await hashPassword(password)
    expect(hash).not.toBe(password)
    expect(await comparePassword(password, hash)).toBe(true)
    expect(await comparePassword('wrongpassword', hash)).toBe(false)
  })

  it('produces different hashes for the same password (salt)', async () => {
    const password = 'MySecurePass1'
    const hash1 = await hashPassword(password)
    const hash2 = await hashPassword(password)
    expect(hash1).not.toBe(hash2)
  })
})

describe('refresh token', () => {
  it('generates a non-empty token', () => {
    const token = generateRefreshToken()
    expect(token).toBeTruthy()
    expect(token.length).toBeGreaterThan(32)
  })

  it('hashToken produces consistent output', () => {
    const token = 'test-token-abc'
    expect(hashToken(token)).toBe(hashToken(token))
    expect(hashToken(token)).not.toBe(hashToken('other-token'))
  })
})

// ─── 2FA Tests ────────────────────────────────────────────────────────────────

describe('TOTP 2FA', () => {
  it('generates setup with secret and QR code', async () => {
    process.env.TWO_FACTOR_ENCRYPTION_KEY = 'test-encryption-key-32-chars-ok!'
    const { secret, qrCodeUrl, encryptedSecret } = await generateTwoFactorSetup('test@example.com')
    expect(secret).toBeTruthy()
    expect(qrCodeUrl).toContain('data:image/png')
    expect(encryptedSecret).toContain(':')
    expect(encryptedSecret).not.toBe(secret)
  })
})

// ─── Utils Tests ──────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('converts company names to slugs', () => {
    expect(slugify('Minha Empresa')).toBe('minha-empresa')
    expect(slugify('Tech & Solutions Ltda.')).toBe('tech-solutions-ltda')
    expect(slugify('  Extra  Spaces  ')).toBe('extra-spaces')
  })
})

describe('phone validation', () => {
  it('validates E.164 phone numbers', () => {
    expect(isValidPhoneNumber('+5511999990001')).toBe(true)
    expect(isValidPhoneNumber('+1 (555) 123-4567')).toBe(false) // not normalized
    expect(isValidPhoneNumber('11999990001')).toBe(false)       // missing +
  })

  it('normalizes phone numbers to E.164', () => {
    expect(normalizePhone('5511999990001')).toBe('+5511999990001')
    expect(normalizePhone('+5511999990001')).toBe('+5511999990001')
    expect(normalizePhone('(55) 11 99999-0001')).toBe('+5511999990001')
  })
})
