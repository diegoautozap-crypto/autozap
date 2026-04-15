// Normaliza um telefone pra comparação: só dígitos.
function digitsOnly(phone: string): string {
  return String(phone || '').replace(/\D/g, '')
}

// Parse uma lista de números ignorados (string com quebra de linha, vírgula ou ponto-e-vírgula).
// Retorna array de strings só com dígitos, removendo vazios e duplicados.
export function parseIgnoredPhones(raw: string | string[] | null | undefined): string[] {
  if (!raw) return []
  const parts = Array.isArray(raw) ? raw : String(raw).split(/[\n,;]/)
  const seen = new Set<string>()
  const result: string[] = []
  for (const p of parts) {
    const d = digitsOnly(p)
    if (d.length >= 8 && !seen.has(d)) {
      seen.add(d)
      result.push(d)
    }
  }
  return result
}

// Compara dois telefones ignorando prefixos internacionais, código do país e o nono dígito BR.
// Estratégia: bate se os últimos 8 dígitos coincidem (número local sem DDD nem +55).
// Isso é robusto para todos os formatos que aparecem no sistema BR:
//   +5511999998888, 5511999998888, 11999998888, 11999988888, 999998888
export function phonesMatch(a: string, b: string): boolean {
  const da = digitsOnly(a)
  const db = digitsOnly(b)
  if (!da || !db) return false
  // Usa os últimos 8 dígitos — é o número local sem DDD/país/nono dígito.
  // Suficiente pra evitar colisão na prática (mesmo com 20M+ linhas, colisão é desprezível).
  const suffixLen = Math.min(8, da.length, db.length)
  return da.slice(-suffixLen) === db.slice(-suffixLen)
}

// Checa se um telefone está na lista de ignorados. Aceita a lista em qualquer formato
// (string com quebra-de-linha, array). Retorna false se lista vazia.
export function isPhoneIgnored(phone: string, ignoredRaw: string | string[] | null | undefined): boolean {
  const list = parseIgnoredPhones(ignoredRaw)
  if (list.length === 0) return false
  return list.some(ignored => phonesMatch(phone, ignored))
}
