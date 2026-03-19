import { Resend } from 'resend'
import { logger } from './logger'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.SMTP_FROM || 'AutoZap <onboarding@resend.dev>'
const APP_URL = process.env.APP_URL || 'https://frontend-production-795a.up.railway.app'

// ─── Templates ────────────────────────────────────────────────────────────────

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
    .btn { display: inline-block; background: #16a34a; color: #fff; padding: 12px 28px;
           border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
    .footer { padding: 20px 32px; font-size: 12px; color: #999; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Auto<span>Zap</span></h1></div>
    <div class="body">${content}</div>
    <div class="footer">Este email foi enviado pelo AutoZap. Se não solicitou, ignore-o.</div>
  </div>
</body>
</html>`
}

// ─── Send Helpers ─────────────────────────────────────────────────────────────

export async function sendVerificationEmail(opts: {
  to: string
  name: string
  token: string
}): Promise<void> {
  const url = `${APP_URL}/verify-email?token=${opts.token}`
  const html = baseLayout(`
    <p>Olá, <strong>${opts.name}</strong>!</p>
    <p>Obrigado por criar sua conta no AutoZap. Confirme seu email clicando no botão abaixo:</p>
    <a href="${url}" class="btn">Confirmar email</a>
    <p>Este link expira em <strong>24 horas</strong>.</p>
    <p>Se você não criou uma conta, ignore este email.</p>
  `)

  const { error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: 'Confirme seu email — AutoZap',
    html,
  })

  if (error) throw new Error(error.message)
  logger.info('Verification email sent', { to: opts.to })
}

export async function sendPasswordResetEmail(opts: {
  to: string
  name: string
  token: string
}): Promise<void> {
  const url = `${APP_URL}/reset-password?token=${opts.token}`
  const html = baseLayout(`
    <p>Olá, <strong>${opts.name}</strong>!</p>
    <p>Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo:</p>
    <a href="${url}" class="btn">Redefinir senha</a>
    <p>Este link expira em <strong>1 hora</strong>. Se você não solicitou, ignore este email.</p>
  `)

  const { error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: 'Redefinição de senha — AutoZap',
    html,
  })

  if (error) throw new Error(error.message)
  logger.info('Password reset email sent', { to: opts.to })
}

export async function sendWelcomeEmail(opts: {
  to: string
  name: string
  tenantName: string
}): Promise<void> {
  const html = baseLayout(`
    <p>Olá, <strong>${opts.name}</strong>!</p>
    <p>Sua conta <strong>${opts.tenantName}</strong> no AutoZap está pronta. 🚀</p>
    <p>Comece conectando seu WhatsApp e enviando sua primeira campanha.</p>
    <a href="${APP_URL}/dashboard" class="btn">Começar agora</a>
  `)

  const { error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `Bem-vindo ao AutoZap, ${opts.name}!`,
    html,
  })

  if (error) throw new Error(error.message)
  logger.info('Welcome email sent', { to: opts.to })
}
