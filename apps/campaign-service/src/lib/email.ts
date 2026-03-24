import { Resend } from 'resend'
import { logger } from './logger'

// Lazy — só instancia quando for usar, evita crash no startup sem RESEND_API_KEY
function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not configured')
  }
  return new Resend(process.env.RESEND_API_KEY)
}
const FROM = process.env.SMTP_FROM || 'AutoZap <onboarding@resend.dev>'
const APP_URL = process.env.APP_URL || 'https://frontend-production-795a.up.railway.app'

function baseLayout(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    body { font-family: -apple-system, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; }
    .header { background: #16a34a; padding: 28px 32px; }
    .header h1 { color: #fff; margin: 0; font-size: 22px; }
    .header span { color: #bbf7d0; }
    .body { padding: 32px; color: #333; line-height: 1.6; }
    .btn { display: inline-block; background: #16a34a; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
    .stat { display: inline-block; background: #f9fafb; border-radius: 8px; padding: 12px 20px; margin: 6px; text-align: center; min-width: 100px; }
    .stat-n { font-size: 24px; font-weight: 700; color: #111827; }
    .stat-l { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .footer { padding: 20px 32px; font-size: 12px; color: #999; border-top: 1px solid #eee; }
    .warn { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Auto<span>Zap</span></h1></div>
    <div class="body">${content}</div>
    <div class="footer">AutoZap — Você está recebendo este email porque tem uma conta ativa.</div>
  </div>
</body>
</html>`
}

// ─── Campanha concluída ───────────────────────────────────────────────────────
export async function sendCampaignCompletedEmail(opts: {
  to: string
  name: string
  campaignName: string
  total: number
  sent: number
  delivered: number
  read: number
  failed: number
  campaignId: string
}): Promise<void> {
  const { to, name, campaignName, total, sent, delivered, read, failed, campaignId } = opts
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0
  const readRate = sent > 0 ? Math.round((read / sent) * 100) : 0
  const failRate = total > 0 ? Math.round((failed / total) * 100) : 0

  const html = baseLayout(`
    <p>Olá, <strong>${name}</strong>!</p>
    <p>Sua campanha <strong>"${campaignName}"</strong> foi concluída. Aqui está o resumo:</p>

    <div style="margin: 20px 0; text-align: center;">
      <div class="stat"><div class="stat-n">${total.toLocaleString('pt-BR')}</div><div class="stat-l">Total</div></div>
      <div class="stat"><div class="stat-n" style="color:#2563eb">${sent.toLocaleString('pt-BR')}</div><div class="stat-l">Enviadas</div></div>
      <div class="stat"><div class="stat-n" style="color:#16a34a">${delivered.toLocaleString('pt-BR')}</div><div class="stat-l">Entregues</div></div>
      <div class="stat"><div class="stat-n" style="color:#7c3aed">${read.toLocaleString('pt-BR')}</div><div class="stat-l">Lidas</div></div>
      <div class="stat"><div class="stat-n" style="color:#dc2626">${failed.toLocaleString('pt-BR')}</div><div class="stat-l">Falhas</div></div>
    </div>

    <p style="color:#6b7280; font-size:14px;">
      Taxa de entrega: <strong>${deliveryRate}%</strong> &nbsp;·&nbsp;
      Taxa de leitura: <strong>${readRate}%</strong> &nbsp;·&nbsp;
      Falhas: <strong>${failRate}%</strong>
    </p>

    ${failRate > 20 ? `<div class="warn">⚠️ <strong>${failRate}% de falhas</strong> — verifique os números inválidos no dashboard de erros.</div>` : ''}

    <a href="${APP_URL}/dashboard/campaigns" class="btn">Ver campanha</a>
  `)

  const { error } = await getResend().emails.send({
    from: FROM,
    to,
    subject: `✅ Campanha "${campaignName}" concluída — AutoZap`,
    html,
  })

  if (error) throw new Error(error.message)
  logger.info('Campaign completed email sent', { to, campaignName })
}

// ─── Trial expirando ──────────────────────────────────────────────────────────
export async function sendTrialExpiringEmail(opts: {
  to: string
  name: string
  daysLeft: number
}): Promise<void> {
  const { to, name, daysLeft } = opts
  const isToday = daysLeft === 0

  const html = baseLayout(`
    <p>Olá, <strong>${name}</strong>!</p>
    ${isToday
      ? `<p>Seu período de trial do AutoZap <strong>expira hoje</strong>. Após isso você perderá acesso ao sistema.</p>`
      : `<p>Seu período de trial do AutoZap expira em <strong>${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}</strong>.</p>`
    }
    <p>Para continuar usando o AutoZap sem interrupção, assine agora:</p>
    <a href="${APP_URL}/dashboard/settings" class="btn">${isToday ? 'Assinar agora' : 'Ver planos'}</a>
    <p style="color:#6b7280; font-size:13px;">Dúvidas? Responda este email e te ajudamos.</p>
  `)

  const subject = isToday
    ? '⚠️ Seu trial expira hoje — AutoZap'
    : `⏰ Seu trial expira em ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'} — AutoZap`

  const { error } = await getResend().emails.send({ from: FROM, to, subject, html })
  if (error) throw new Error(error.message)
  logger.info('Trial expiring email sent', { to, daysLeft })
}