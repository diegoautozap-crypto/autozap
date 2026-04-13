import { Router } from 'express'
import { requireAuth, requireRole, ok, db, logger } from '@autozap/utils'

function getGoogleOAuth2Client() {
  const { google } = require('googleapis')
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
}

const router = Router()

// ─── Google OAuth callback (público — redirect do Google) ────────────────────
router.get('/integrations/google/callback', async (req: any, res: any) => {
  try {
    const { code, state } = req.query
    if (!code || !state) { res.status(400).send('Parâmetros inválidos'); return }

    // state = tenantId (passado no auth URL)
    const tenantId = state as string
    const oauth2Client = getGoogleOAuth2Client()
    const { tokens } = await oauth2Client.getToken(code as string)
    oauth2Client.setCredentials(tokens)

    // Get user email
    const { google } = require('googleapis')
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: profile } = await oauth2.userinfo.get()

    const { db } = await import('@autozap/utils')
    const { data: tenant } = await db.from('tenants').select('metadata').eq('id', tenantId).single()
    const metadata = tenant?.metadata || {}

    await db.from('tenants').update({
      metadata: {
        ...metadata,
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokens.expiry_date,
        google_email: profile.email,
      },
      updated_at: new Date(),
    }).eq('id', tenantId)

    // Redirect back to frontend settings
    const frontendUrl = process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:3000'
    res.redirect(`${frontendUrl}/dashboard/settings?google=connected`)
  } catch (err) {
    logger.error('Google OAuth callback error', { err })
    const frontendUrl = process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:3000'
    res.redirect(`${frontendUrl}/dashboard/settings?google=error`)
  }
})


// ─── Auth obrigatório ────────────────────────────────────────────────────────
router.use(requireAuth)

// ─── Google Calendar Integration ─────────────────────────────────────────────

router.get('/integrations/google/auth-url', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) { res.status(500).json({ error: 'Google OAuth not configured' }); return }
    const oauth2Client = getGoogleOAuth2Client()
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state: req.auth.tid, // pass tenantId in state
    })
    res.json(ok({ url }))
  } catch (err) { next(err) }
})

router.delete('/integrations/google', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { db } = await import('@autozap/utils')
    const { data: tenant } = await db.from('tenants').select('metadata').eq('id', req.auth.tid).single()
    const metadata = { ...(tenant?.metadata || {}) }
    delete metadata.google_access_token
    delete metadata.google_refresh_token
    delete metadata.google_token_expiry
    delete metadata.google_email
    await db.from('tenants').update({ metadata, updated_at: new Date() }).eq('id', req.auth.tid)
    res.json(ok({ message: 'Google desconectado' }))
  } catch (err) { next(err) }
})

router.get('/integrations/google/calendars', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { db } = await import('@autozap/utils')
    const { data: tenant } = await db.from('tenants').select('metadata').eq('id', req.auth.tid).single()
    const meta = tenant?.metadata || {}
    if (!meta.google_access_token) { res.status(400).json({ error: 'Google não conectado' }); return }

    const oauth2Client = getGoogleOAuth2Client()
    oauth2Client.setCredentials({
      access_token: meta.google_access_token,
      refresh_token: meta.google_refresh_token,
    })

    // Handle token refresh
    oauth2Client.on('tokens', async (tokens: any) => {
      if (tokens.access_token) {
        await db.from('tenants').update({
          metadata: { ...meta, google_access_token: tokens.access_token, google_token_expiry: tokens.expiry_date },
          updated_at: new Date(),
        }).eq('id', req.auth.tid)
      }
    })

    const { google } = require('googleapis')
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
    const { data } = await calendar.calendarList.list()
    const calendars = (data.items || []).map((c: any) => ({
      id: c.id,
      name: c.summary,
      primary: c.primary || false,
    }))
    res.json(ok(calendars))
  } catch (err) { next(err) }
})


export default router
