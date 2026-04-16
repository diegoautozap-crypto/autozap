import { logger } from '@autozap/utils'

const OUTSCRAPER_API_KEY = process.env.OUTSCRAPER_API_KEY || ''
const BASE_URL = 'https://api.outscraper.com'

export interface OutscraperLead {
  name: string
  phone: string | null
  address: string | null
  website: string | null
  rating: number | null
  reviews_count: number | null
  category: string | null
  email: string | null
  raw: any
}

/**
 * Busca leads no Google Maps via Outscraper.
 * Retorna lista com dados básicos.
 */
export async function searchGoogleMaps(opts: {
  query: string        // ex: "dentista São Paulo"
  limit: number        // qty de resultados
  language?: string    // 'pt'
}): Promise<OutscraperLead[]> {
  if (!OUTSCRAPER_API_KEY) throw new Error('OUTSCRAPER_API_KEY não configurada')
  if (opts.limit < 1 || opts.limit > 500) throw new Error('Limit entre 1 e 500')

  const url = new URL(`${BASE_URL}/maps/search-v3`)
  url.searchParams.set('query', opts.query)
  url.searchParams.set('limit', String(opts.limit))
  url.searchParams.set('language', opts.language || 'pt')
  url.searchParams.set('async', 'false') // espera resultado direto
  url.searchParams.set('fields', 'name,phone,full_address,site,rating,reviews,subtypes,email_1')

  logger.info('[Outscraper] searching', { query: opts.query, limit: opts.limit })

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-API-KEY': OUTSCRAPER_API_KEY },
  })

  if (!res.ok) {
    const text = await res.text()
    logger.error('[Outscraper] error', { status: res.status, body: text.slice(0, 300) })
    throw new Error(`Outscraper falhou: HTTP ${res.status}`)
  }

  const json: any = await res.json()
  // Outscraper retorna { data: [[lead, lead, ...]] } (array de arrays porque suporta múltiplas queries)
  const flatList: any[] = Array.isArray(json?.data?.[0]) ? json.data[0] : (json?.data || [])

  return flatList.map((item: any): OutscraperLead => ({
    name: item.name || item.business_name || '',
    phone: item.phone || item.phone_1 || null,
    address: item.full_address || item.address || null,
    website: item.site || item.website || null,
    rating: typeof item.rating === 'number' ? item.rating : null,
    reviews_count: typeof item.reviews === 'number' ? item.reviews : null,
    category: Array.isArray(item.subtypes) ? item.subtypes.join(', ') : (item.category || null),
    email: item.email_1 || item.email || null,
    raw: item,
  }))
}
