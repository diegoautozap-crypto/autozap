'use client'

import Link from 'next/link'

export default function LandingPage() {
  return (
    <div style={{ background: '#0c0c0c', color: '#f0f0f0', minHeight: '100vh', fontFamily: "'Syne', -apple-system, sans-serif" }}>

      {/* Grid background */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(34,197,94,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* NAV */}
        <nav style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1a1a1a', background: 'rgba(12,12,12,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', background: '#16a34a', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>⚡</div>
            <span style={{ fontWeight: 800, fontSize: '20px', letterSpacing: '-0.03em' }}>Auto<span style={{ color: '#22c55e' }}>Zap</span></span>
          </div>
          <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
            <a href="#features" style={{ color: '#9ca3af', fontSize: '14px', textDecoration: 'none' }}>Features</a>
            <a href="#how" style={{ color: '#9ca3af', fontSize: '14px', textDecoration: 'none' }}>Como funciona</a>
            <a href="#plans" style={{ color: '#9ca3af', fontSize: '14px', textDecoration: 'none' }}>Planos</a>
            <Link href="/login" style={{ color: '#9ca3af', fontSize: '14px', textDecoration: 'none' }}>Entrar</Link>
            <Link href="/register" style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', borderRadius: '8px', fontSize: '14px', fontWeight: 700, textDecoration: 'none' }}>Começar agora</Link>
          </div>
        </nav>

        {/* HERO */}
        <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '100px 40px 80px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#052e16', border: '1px solid #16a34a', borderRadius: '99px', padding: '6px 14px', fontSize: '12px', color: '#22c55e', fontWeight: 600, marginBottom: '32px', fontFamily: 'monospace' }}>
            ⚡ API Oficial Meta + Evolution API
          </div>
          <h1 style={{ fontSize: '64px', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: '24px', background: 'linear-gradient(135deg, #fff 0%, #9ca3af 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Automatize seu<br />WhatsApp do jeito certo
          </h1>
          <p style={{ fontSize: '18px', color: '#6b7280', lineHeight: 1.7, maxWidth: '600px', margin: '0 auto 40px' }}>
            CRM completo com flows visuais, agendamento Google Calendar, IA integrada, campanhas em massa e multi-canal. Tudo em um só lugar.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register" style={{ padding: '14px 32px', background: '#16a34a', color: '#fff', borderRadius: '10px', fontSize: '15px', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              Começar agora
            </Link>
            <a href="#how" style={{ padding: '14px 32px', background: 'transparent', color: '#e5e7eb', borderRadius: '10px', fontSize: '15px', fontWeight: 600, textDecoration: 'none', border: '1px solid #2d2d2d' }}>
              Ver como funciona
            </a>
          </div>
          <p style={{ marginTop: '16px', fontSize: '13px', color: '#4b5563' }}>Gupshup (API oficial) + Evolution API · Setup em 5 minutos</p>
        </section>

        {/* STATS */}
        <section style={{ borderTop: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a', background: '#141414' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0' }}>
            {[
              { n: '98%', label: 'Taxa de entrega' },
              { n: '1.200', label: 'Msgs/min por canal' },
              { n: '24/7', label: 'Atendimento automático' },
              { n: '5min', label: 'Para configurar' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '24px', borderRight: i < 3 ? '1px solid #1e1e1e' : 'none' }}>
                <div style={{ fontSize: '36px', fontWeight: 800, color: '#22c55e', letterSpacing: '-0.04em', marginBottom: '6px' }}>{s.n}</div>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" style={{ maxWidth: '1100px', margin: '0 auto', padding: '100px 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px', fontFamily: 'monospace' }}>Features</p>
            <h2 style={{ fontSize: '42px', fontWeight: 800, letterSpacing: '-0.03em', color: '#f0f0f0' }}>Tudo que você precisa</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {[
              { emoji: '🤖', title: 'Flow Builder Visual', desc: '20+ tipos de nó. Crie fluxos completos arrastando blocos — sem código. Gatilhos por palavra-chave, horário, primeira mensagem e webhook.' },
              { emoji: '📅', title: 'Google Calendar', desc: 'Agendamento nativo integrado ao Google Calendar. Mostra horários disponíveis, preços por dia/hora e cria eventos automaticamente.' },
              { emoji: '🧠', title: 'IA com ChatGPT', desc: 'Integração nativa com GPT-4o. Responda, classifique intenções, extraia dados e resuma conversas automaticamente.' },
              { emoji: '📥', title: 'Inbox em tempo real', desc: 'Caixa de entrada para sua equipe. O bot para automaticamente quando o atendente assume. Suporte a imagens, vídeos, áudios e PDFs.' },
              { emoji: '📊', title: 'Pipeline de vendas', desc: 'Kanban visual para acompanhar leads do primeiro contato ao fechamento. Move contatos entre etapas automaticamente.' },
              { emoji: '📦', title: 'Campanhas em massa', desc: 'Disparo para listas ou tags com rate limit inteligente, múltiplas copies, retry automático e relatório de entrega.' },
              { emoji: '👥', title: 'Gestão de equipe', desc: 'Adicione atendentes com permissões granulares por canal, conversa e campanha. Controle total por usuário.' },
              { emoji: '📱', title: 'Multi-canal', desc: 'Gupshup (API oficial com botões) + Evolution API (coexistência com celular). Use os dois ao mesmo tempo.' },
              { emoji: '🔗', title: 'Webhooks e Integrações', desc: 'Integre com qualquer sistema via webhook. Notifique donos, conecte com n8n, ERPs ou planilhas durante os flows.' },
            ].map((f, i) => (
              <div key={i} style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '24px', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#22c55e'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#1e1e1e'}>
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>{f.emoji}</div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f0f0f0', marginBottom: '8px' }}>{f.title}</h3>
                <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" style={{ background: '#0f0f0f', borderTop: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '100px 40px' }}>
            <div style={{ textAlign: 'center', marginBottom: '64px' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px', fontFamily: 'monospace' }}>Como funciona</p>
              <h2 style={{ fontSize: '42px', fontWeight: 800, letterSpacing: '-0.03em', color: '#f0f0f0' }}>Em 3 passos simples</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '40px' }}>
              {[
                { n: '01', title: 'Conecte seu WhatsApp', desc: 'Cadastre-se e conecte seu número via Gupshup (API oficial) ou Evolution API (QR Code). Setup em 5 minutos.' },
                { n: '02', title: 'Monte seus flows', desc: 'Use o editor visual para criar fluxos de atendimento, agendamento, captação de leads ou suporte automatizado.' },
                { n: '03', title: 'Escale seu atendimento', desc: 'Dispare campanhas, agende pelo Google Calendar, acompanhe leads no funil e deixe sua equipe focar no que importa.' },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#052e16', border: '1px solid #16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#22c55e' }}>{s.n}</div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f0f0f0', marginBottom: '10px' }}>{s.title}</h3>
                  <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: 1.7 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PLANS */}
        <section id="plans" style={{ maxWidth: '1100px', margin: '0 auto', padding: '100px 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px', fontFamily: 'monospace' }}>Planos</p>
            <h2 style={{ fontSize: '42px', fontWeight: 800, letterSpacing: '-0.03em', color: '#f0f0f0' }}>Simples e transparente</h2>
            <p style={{ fontSize: '15px', color: '#6b7280', marginTop: '12px' }}>Todos os planos incluem: Inbox, Flows, Campanhas, Google Calendar, Pipeline e IA</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {[
              { name: 'Starter', price: 'R$ 149', period: ',99/mês', msgs: '10.000 msgs', features: ['3 canais', '3 membros', '5 flows', '10k contatos', '5k IA/mês', 'Google Calendar', 'Campanhas ilimitadas'], highlight: false },
              { name: 'Pro', price: 'R$ 299', period: ',99/mês', msgs: '50.000 msgs', features: ['10 canais', '10 membros', '20 flows', '50k contatos', '30k IA/mês', '50 produtos', 'Transcrição de áudio', 'Relatórios e export'], highlight: true },
              { name: 'Enterprise', price: 'R$ 599', period: ',99/mês', msgs: '200.000 msgs', features: ['30 canais', '30 membros', 'Flows ilimitados', '100k contatos', '100k IA/mês', '500 produtos', 'Transcrição', 'Relatórios'], highlight: false },
              { name: 'Unlimited', price: 'R$ 999', period: ',99/mês', msgs: 'Ilimitado', features: ['Canais ilimitados', 'Membros ilimitados', 'Tudo ilimitado', 'Suporte dedicado'], highlight: false },
            ].map((p, i) => (
              <div key={i} style={{ background: p.highlight ? '#0a1f0a' : '#141414', border: `1px solid ${p.highlight ? '#16a34a' : '#1e1e1e'}`, borderRadius: '12px', padding: '28px 24px', position: 'relative' }}>
                {p.highlight && <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '3px 12px', borderRadius: '99px', whiteSpace: 'nowrap' }}>Mais popular</div>}
                <div style={{ fontSize: '13px', fontWeight: 700, color: p.highlight ? '#22c55e' : '#6b7280', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '32px', fontWeight: 800, color: '#f0f0f0', letterSpacing: '-0.04em', lineHeight: 1 }}>{p.price}</span>
                  <span style={{ fontSize: '14px', color: '#6b7280' }}>{p.period}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#22c55e', fontFamily: 'monospace', marginBottom: '20px', marginTop: '4px' }}>{p.msgs}</div>
                <div style={{ height: '1px', background: '#1e1e1e', marginBottom: '20px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                  {p.features.map((f, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#9ca3af' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#052e16', border: '1px solid #16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '9px', color: '#22c55e' }}>✓</div>
                      {f}
                    </div>
                  ))}
                </div>
                <Link href="/register" style={{ display: 'block', textAlign: 'center', padding: '10px', background: p.highlight ? '#16a34a' : 'transparent', color: p.highlight ? '#fff' : '#e5e7eb', border: `1px solid ${p.highlight ? '#16a34a' : '#2d2d2d'}`, borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                  Começar agora
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section style={{ background: '#0f0f0f', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ maxWidth: '720px', margin: '0 auto', padding: '100px 40px' }}>
            <div style={{ textAlign: 'center', marginBottom: '56px' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px', fontFamily: 'monospace' }}>FAQ</p>
              <h2 style={{ fontSize: '36px', fontWeight: 800, letterSpacing: '-0.03em', color: '#f0f0f0' }}>Perguntas frequentes</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { q: 'Qual a diferença entre Gupshup e Evolution?', a: 'Gupshup é a API oficial da Meta — suporta botões clicáveis e templates aprovados. Evolution usa QR Code com coexistência no celular. Você pode usar os dois ao mesmo tempo.' },
                { q: 'O Google Calendar está incluído em todos os planos?', a: 'Sim. O agendamento nativo com Google Calendar está disponível em todos os planos. Seus clientes podem ver horários disponíveis e agendar direto pelo WhatsApp.' },
                { q: 'O que acontece se eu ultrapassar o limite de mensagens?', a: 'O sistema pausa novos envios automaticamente. Você recebe um alerta no painel antes de atingir o limite para fazer upgrade.' },
                { q: 'Posso ter mais de um número de WhatsApp?', a: 'Sim. Starter suporta 3 canais, Pro 10 canais, Enterprise 30 e Unlimited é ilimitado.' },
                { q: 'A IA (ChatGPT) está incluída?', a: 'Sim, em todos os planos. Você precisa da sua própria chave de API da OpenAI. O CRM integra nativamente com GPT-4o para respostas, classificação e extração.' },
                { q: 'Posso cancelar quando quiser?', a: 'Sim, sem multa ou fidelidade. Ao cancelar, você mantém acesso até o fim do período pago.' },
              ].map((f, i) => (
                <div key={i} style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: '10px', padding: '20px 22px' }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#f0f0f0', marginBottom: '8px' }}>{f.q}</p>
                  <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '100px 40px', textAlign: 'center' }}>
          <div style={{ background: '#0a1f0a', border: '1px solid #16a34a', borderRadius: '20px', padding: '72px 40px' }}>
            <h2 style={{ fontSize: '48px', fontWeight: 800, letterSpacing: '-0.04em', color: '#f0f0f0', marginBottom: '16px' }}>
              Pronto para automatizar<br />seu WhatsApp?
            </h2>
            <p style={{ fontSize: '16px', color: '#6b7280', marginBottom: '36px' }}>Crie sua conta e comece a usar em 5 minutos.</p>
            <Link href="/register" style={{ display: 'inline-block', padding: '16px 40px', background: '#16a34a', color: '#fff', borderRadius: '12px', fontSize: '16px', fontWeight: 700, textDecoration: 'none' }}>
              Criar conta agora →
            </Link>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ borderTop: '1px solid #1a1a1a', padding: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '28px', height: '28px', background: '#16a34a', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>⚡</div>
            <span style={{ fontWeight: 700, fontSize: '15px', color: '#f0f0f0' }}>Auto<span style={{ color: '#22c55e' }}>Zap</span></span>
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            <a href="#" style={{ fontSize: '13px', color: '#6b7280', textDecoration: 'none' }}>Termos de uso</a>
            <a href="#" style={{ fontSize: '13px', color: '#6b7280', textDecoration: 'none' }}>Privacidade</a>
            <a href="mailto:contato@useautozap.app" style={{ fontSize: '13px', color: '#6b7280', textDecoration: 'none' }}>contato@useautozap.app</a>
          </div>
          <p style={{ fontSize: '12px', color: '#374151', fontFamily: 'monospace' }}>© 2026 AutoZap. Todos os direitos reservados.</p>
        </footer>

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        a:hover { opacity: 0.85; }
      `}</style>
    </div>
  )
}
