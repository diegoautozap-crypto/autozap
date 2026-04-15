// Validadores de input pra fluxos. Cada validador retorna { valid, normalized?, error? }.
// Se valid=true, normalized é o valor formatado pra salvar (ex: CPF com pontuação).

export type ValidationType = 'email' | 'cpf' | 'cnpj' | 'phone' | 'date' | 'number' | 'text'

export interface ValidationResult {
  valid: boolean
  normalized?: string
  error?: string
}

function digits(s: string): string {
  return String(s || '').replace(/\D/g, '')
}

function validateEmail(v: string): ValidationResult {
  const trimmed = String(v || '').trim().toLowerCase()
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
  if (!re.test(trimmed)) return { valid: false, error: 'E-mail inválido. Ex: joao@empresa.com' }
  return { valid: true, normalized: trimmed }
}

function validateCpf(v: string): ValidationResult {
  const d = digits(v)
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return { valid: false, error: 'CPF inválido. Digite 11 dígitos.' }
  // Verificação de dígitos
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i)
  let rev = 11 - (sum % 11)
  if (rev >= 10) rev = 0
  if (rev !== parseInt(d[9])) return { valid: false, error: 'CPF inválido.' }
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i)
  rev = 11 - (sum % 11)
  if (rev >= 10) rev = 0
  if (rev !== parseInt(d[10])) return { valid: false, error: 'CPF inválido.' }
  return { valid: true, normalized: `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` }
}

function validateCnpj(v: string): ValidationResult {
  const d = digits(v)
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return { valid: false, error: 'CNPJ inválido. Digite 14 dígitos.' }
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 12; i++) sum += parseInt(d[i]) * weights1[i]
  let rev = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  if (rev !== parseInt(d[12])) return { valid: false, error: 'CNPJ inválido.' }
  sum = 0
  for (let i = 0; i < 13; i++) sum += parseInt(d[i]) * weights2[i]
  rev = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  if (rev !== parseInt(d[13])) return { valid: false, error: 'CNPJ inválido.' }
  return { valid: true, normalized: `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` }
}

function validatePhone(v: string): ValidationResult {
  const d = digits(v)
  // BR: 10-11 dígitos (com DDD). Aceita com ou sem +55.
  const local = d.startsWith('55') && d.length > 11 ? d.slice(2) : d
  if (local.length < 10 || local.length > 11) return { valid: false, error: 'Telefone inválido. Use DDD + número, ex: 11999998888' }
  const ddd = local.slice(0, 2)
  if (parseInt(ddd) < 11 || parseInt(ddd) > 99) return { valid: false, error: 'DDD inválido.' }
  const full = `+55${local}`
  return { valid: true, normalized: full }
}

function validateDate(v: string): ValidationResult {
  const s = String(v || '').trim()
  // Aceita DD/MM/AAAA, DD-MM-AAAA, AAAA-MM-DD, DD/MM/AA
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  let day: number, month: number, year: number
  if (m1) {
    day = parseInt(m1[1]); month = parseInt(m1[2]); year = parseInt(m1[3])
    if (year < 100) year = year < 50 ? 2000 + year : 1900 + year
  } else if (m2) {
    year = parseInt(m2[1]); month = parseInt(m2[2]); day = parseInt(m2[3])
  } else {
    return { valid: false, error: 'Data inválida. Use DD/MM/AAAA.' }
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return { valid: false, error: 'Data inválida.' }
  const date = new Date(year, month - 1, day)
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return { valid: false, error: 'Data inválida.' }
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return { valid: true, normalized: iso }
}

function validateNumber(v: string): ValidationResult {
  const s = String(v || '').trim().replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  if (!isFinite(n) || isNaN(n)) return { valid: false, error: 'Valor inválido. Digite apenas números.' }
  return { valid: true, normalized: String(n) }
}

export function validateInput(type: ValidationType | null | undefined, value: string): ValidationResult {
  if (!type || type === 'text') return { valid: true, normalized: String(value || '').trim() }
  switch (type) {
    case 'email':  return validateEmail(value)
    case 'cpf':    return validateCpf(value)
    case 'cnpj':   return validateCnpj(value)
    case 'phone':  return validatePhone(value)
    case 'date':   return validateDate(value)
    case 'number': return validateNumber(value)
    default:       return { valid: true, normalized: String(value || '').trim() }
  }
}
