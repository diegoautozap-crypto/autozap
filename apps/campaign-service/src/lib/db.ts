import { createClient } from '@supabase/supabase-js'

// PERF: For high-volume campaigns (100k+), use the Supabase connection pooler URL
// instead of the direct URL. On the "Small" plan, switch SUPABASE_URL to the pooler
// endpoint to avoid exhausting Postgres connection limits under load.
const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_KEY! // service_role key — bypasses RLS

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
}

export const db = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
