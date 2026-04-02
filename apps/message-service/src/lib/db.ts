import { createClient } from '@supabase/supabase-js'

// PERF: For high-volume (100k+ messages), use the Supabase connection pooler URL
// instead of the direct URL. On the "Small" plan, switch SUPABASE_URL from:
//   https://<project>.supabase.co  (direct — limited connections)
// to the pooler endpoint:
//   https://<project>.supabase.co  with db.pool_mode or use the pooler port (6543)
// This avoids exhausting the Postgres connection limit under load.
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
