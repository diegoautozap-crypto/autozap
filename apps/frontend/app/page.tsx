'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'

/* ─── FAQ data ─── */
const faqs = [
  { q: 'Preciso de CNPJ para usar?', a: 'Nao precisa. Pessoa fisica usa normal.' },
  { q: 'Quanto tempo leva pra configurar?', a: 'Conecta o WhatsApp por QR code, configura uns flows e ja esta rodando. Uns 15 minutos se voce for rapido.' },
  { q: 'O que a IA faz exatamente?', a: 'Responde mensagens automaticamente, transcreve audios, classifica leads por intencao de compra e sugere respostas pros atendentes.' },
  { q: 'Integra com outros sistemas?', a: 'Tem integracao com Zapier, webhooks e API aberta. Da pra conectar com praticamente qualquer coisa.' },
  { q: 'Posso cancelar quando quiser?', a: 'Sim. Sem multa, sem fidelidade. Cancela direto no painel.' },
  { q: 'Quantos atendentes posso ter?', a: 'Depende do plano: Starter 5, Pro 10, Enterprise 30, Unlimited sem limite.' },
]

/* ─── Features data ─── */
const features = [
  { title: 'Inbox', desc: 'Conversas em tempo real com busca, atribuicao por atendente, notas internas e respostas rapidas.' },
  { title: 'CRM', desc: 'Contatos com tags, campos personalizados, importacao em massa e historico completo de interacoes.' },
  { title: 'Pipeline de vendas', desc: 'Kanban com drag-and-drop, tarefas por deal, follow-up automatico e previsao de receita.' },
  { title: 'Campanhas', desc: 'Disparo em massa com segmentacao por tags, agendamento e metricas de entrega e leitura.' },
  { title: 'IA', desc: 'Respostas automaticas, transcricao de audio, classificacao de leads e sugestao de respostas.' },
  { title: 'Automacoes', desc: '28 tipos de nos, editor visual drag-and-drop. Monta flows de atendimento e vendas sem codigo.' },
]

/* ─── Plans data ─── */
const plans = [
  { slug: 'starter', name: 'Starter', price: '149,99', msgs: '10.000 msgs/mes', agents: '5 membros', popular: false, features: ['5 canais WhatsApp', '3 flows de automacao', '10.000 contatos', '10.000 respostas IA/mes', '5 campanhas/mes'] },
  { slug: 'pro', name: 'Pro', price: '299,99', msgs: '50.000 msgs/mes', agents: '10 membros', popular: true, features: ['10 canais WhatsApp', '15 flows de automacao', '50.000 contatos', '50.000 respostas IA/mes', 'Transcricao de audio', 'Relatorios avancados'] },
  { slug: 'enterprise', name: 'Enterprise', price: '599,99', msgs: '150.000 msgs/mes', agents: '30 membros', popular: false, features: ['30 canais WhatsApp', 'Flows ilimitados', '150.000 contatos', '150.000 respostas IA/mes', 'Campanhas ilimitadas', 'Suporte prioritario'] },
  { slug: 'unlimited', name: 'Unlimited', price: '999,99', msgs: 'Msgs ilimitadas', agents: 'Membros ilimitados', popular: false, features: ['Tudo ilimitado', 'API sem limites', 'SLA garantido', 'Gerente de conta', 'Integracoes custom'] },
]

/* ─── Steps data ─── */
const steps = [
  { num: '1', title: 'Conecte o WhatsApp', desc: 'Escaneie o QR Code ou use a API oficial Gupshup. Leva 2 minutos.' },
  { num: '2', title: 'Monte seus flows', desc: 'Use o editor visual pra criar automacoes de atendimento, vendas e follow-up.' },
  { num: '3', title: 'Deixe rodar', desc: 'A IA atende, qualifica e responde. Voce acompanha pelo painel.' },
]

export default function LandingPage() {
  const router = useRouter()
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)

  useEffect(() => {
    const state = useAuthStore.getState()
    if (state.user && state.accessToken && state.isAuthenticated) {
      router.replace('/dashboard')
    } else {
      setAuthChecked(true)
    }
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (id: string) => {
    setMobileMenu(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  if (!authChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f4f4f5' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e4e4e7', borderTop: '3px solid #22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ background: '#ffffff', color: '#18181b', fontFamily: "'Inter', system-ui, sans-serif", minHeight: '100vh' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: translateY(0) } }
        .fade-up { animation: fadeUp .6s ease-out both }
        .fade-up-d1 { animation-delay: .1s }
        .fade-up-d2 { animation-delay: .2s }
        .fade-up-d3 { animation-delay: .3s }
        .btn-green { background: #22c55e; color: #fff; border: none; padding: 12px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .2s; text-decoration: none; display: inline-block }
        .btn-green:hover { background: #16a34a }
        .btn-green-lg { padding: 16px 36px; font-size: 17px; border-radius: 10px }
        .btn-outline { background: transparent; color: #18181b; border: 1.5px solid #e4e4e7; padding: 10px 24px; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; transition: all .2s; text-decoration: none; display: inline-block }
        .btn-outline:hover { border-color: #22c55e; color: #22c55e }
        .card-hover { transition: transform .2s, box-shadow .2s }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 8px 30px rgba(0,0,0,.1) }
        .faq-answer { overflow: hidden; transition: max-height .3s ease, padding .3s ease }
        .check-icon { display: inline-block; width: 16px; height: 16px; background: #22c55e; border-radius: 50%; position: relative; flex-shrink: 0 }
        .check-icon::after { content: ''; position: absolute; left: 5px; top: 3px; width: 4px; height: 8px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg) }
      `}</style>

      {/* ═══ NAVBAR ═══ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? 'rgba(255,255,255,.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid #e4e4e7' : '1px solid transparent',
        transition: 'all .3s',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 22, color: '#18181b' }}>
            AutoZap
          </div>

          {/* Desktop links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="nav-desktop">
            <span onClick={() => scrollTo('funcionalidades')} style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#71717a', transition: 'color .2s' }}>Funcionalidades</span>
            <span onClick={() => scrollTo('planos')} style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#71717a' }}>Planos</span>
            <span onClick={() => scrollTo('faq')} style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#71717a' }}>FAQ</span>
            <a href="/login" className="btn-outline" style={{ padding: '8px 20px', fontSize: 14 }}>Entrar</a>
            <a href="/register" className="btn-green" style={{ padding: '8px 20px', fontSize: 14 }}>Criar conta</a>
          </div>

          {/* Mobile hamburger */}
          <div
            onClick={() => setMobileMenu(!mobileMenu)}
            style={{ display: 'none', cursor: 'pointer', flexDirection: 'column', gap: 5, padding: 4 }}
            className="nav-mobile-toggle"
          >
            <div style={{ width: 22, height: 2, background: '#18181b', borderRadius: 2 }} />
            <div style={{ width: 22, height: 2, background: '#18181b', borderRadius: 2 }} />
            <div style={{ width: 22, height: 2, background: '#18181b', borderRadius: 2 }} />
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenu && (
          <div style={{ background: '#fff', borderTop: '1px solid #e4e4e7', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }} className="nav-mobile-menu">
            <span onClick={() => scrollTo('funcionalidades')} style={{ cursor: 'pointer', fontSize: 15, fontWeight: 500, color: '#18181b' }}>Funcionalidades</span>
            <span onClick={() => scrollTo('planos')} style={{ cursor: 'pointer', fontSize: 15, fontWeight: 500, color: '#18181b' }}>Planos</span>
            <span onClick={() => scrollTo('faq')} style={{ cursor: 'pointer', fontSize: 15, fontWeight: 500, color: '#18181b' }}>FAQ</span>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <a href="/login" className="btn-outline" style={{ flex: 1, textAlign: 'center' }}>Entrar</a>
              <a href="/register" className="btn-green" style={{ flex: 1, textAlign: 'center' }}>Criar conta</a>
            </div>
          </div>
        )}

        <style>{`
          @media (max-width: 768px) {
            .nav-desktop { display: none !important }
            .nav-mobile-toggle { display: flex !important }
          }
        `}</style>
      </nav>

      {/* ═══ HERO ═══ */}
      <section style={{
        paddingTop: 140, paddingBottom: 80,
        background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
        textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 2 }}>
          <h1 className="fade-up fade-up-d1" style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.1, color: '#18181b', marginBottom: 20, letterSpacing: '-0.02em' }}>
            CRM com WhatsApp<br /><span style={{ color: '#22c55e' }}>integrado</span>
          </h1>
          <p className="fade-up fade-up-d2" style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: '#71717a', maxWidth: 560, margin: '0 auto 36px', lineHeight: 1.6 }}>
            Inbox, pipeline, campanhas e IA num unico painel. Conecta o WhatsApp e gerencia vendas de ponta a ponta.
          </p>
          <div className="fade-up fade-up-d3" style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/register" className="btn-green btn-green-lg">Criar conta</a>
            <button onClick={() => scrollTo('planos')} className="btn-outline" style={{ padding: '16px 36px', fontSize: 17 }}>Ver planos</button>
          </div>
        </div>

        {/* App preview */}
        <div className="fade-up fade-up-d3" style={{ maxWidth: 900, margin: '60px auto 0', padding: '0 24px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
            borderRadius: 16, padding: 3,
            boxShadow: '0 20px 60px rgba(0,0,0,.15)',
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
              borderRadius: 14, padding: '20px 24px 24px', minHeight: 340,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {/* Browser bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                <div style={{ flex: 1, background: '#374151', borderRadius: 6, height: 28, marginLeft: 12, display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
                  <span style={{ color: '#9ca3af', fontSize: 12 }}>app.autozap.com/inbox</span>
                </div>
              </div>
              {/* Inbox preview */}
              <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 260 }}>
                <div style={{ width: '30%', background: '#1f2937', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['Joao Silva', 'Maria Santos', 'Pedro Oliveira', 'Ana Costa'].map((name, i) => (
                    <div key={i} style={{
                      background: i === 0 ? 'rgba(34,197,94,.15)' : '#374151',
                      borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: `hsl(${i * 80}, 60%, 50%)`, flexShrink: 0 }} />
                      <div>
                        <div style={{ color: '#f3f4f6', fontSize: 12, fontWeight: 600 }}>{name}</div>
                        <div style={{ color: '#9ca3af', fontSize: 11 }}>Ultima mensagem...</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1, background: '#111827', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8 }}>
                  <div style={{ alignSelf: 'flex-start', background: '#374151', color: '#e5e7eb', padding: '8px 14px', borderRadius: '12px 12px 12px 4px', fontSize: 13, maxWidth: '70%' }}>
                    Oi, quero saber sobre os planos
                  </div>
                  <div style={{ alignSelf: 'flex-end', background: '#22c55e', color: '#fff', padding: '8px 14px', borderRadius: '12px 12px 4px 12px', fontSize: 13, maxWidth: '70%' }}>
                    Ola Joao! Temos planos a partir de R$149,99/mes. Posso te ajudar a escolher?
                  </div>
                  <div style={{ alignSelf: 'flex-start', background: '#374151', color: '#e5e7eb', padding: '8px 14px', borderRadius: '12px 12px 12px 4px', fontSize: 13, maxWidth: '70%' }}>
                    Quero o mais completo, manda o link
                  </div>
                  <div style={{ alignSelf: 'flex-end', background: '#22c55e', color: '#fff', padding: '8px 14px', borderRadius: '12px 12px 4px 12px', fontSize: 13, maxWidth: '70%' }}>
                    Pronto, enviei o link do plano Pro no seu email.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="funcionalidades" style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
              O que tem dentro
            </h2>
            <p style={{ color: '#71717a', fontSize: 17, maxWidth: 560, margin: '0 auto' }}>
              Seis modulos que cobrem do primeiro contato ao pos-venda.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            {features.map((f, i) => (
              <div key={i} className="card-hover" style={{
                background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12,
                padding: 28, cursor: 'default',
              }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ color: '#71717a', fontSize: 15, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section style={{ padding: '96px 24px', background: '#fafafa' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Como funciona
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 32 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', background: '#22c55e', color: '#fff',
                  fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px',
                }}>
                  {s.num}
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{s.title}</h3>
                <p style={{ color: '#71717a', fontSize: 15, lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ AI HIGHLIGHT ═══ */}
      <section style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 64, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 400px' }}>
            <p style={{ color: '#22c55e', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 20 }}>
              Inteligencia Artificial
            </p>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
              Entende texto e <span style={{ color: '#22c55e' }}>audio</span>
            </h2>
            <p style={{ color: '#71717a', fontSize: 17, lineHeight: 1.7, marginBottom: 24 }}>
              Cliente mandou audio? A IA transcreve, entende o contexto e responde. Funciona igual a texto.
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {['Transcricao automatica de audios', 'Respostas com contexto da conversa', 'Classificacao de leads por intencao', 'Sugestao de respostas para atendentes'].map((item, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: '#3f3f46' }}>
                  <span className="check-icon" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ flex: '1 1 360px', display: 'flex', justifyContent: 'center' }}>
            <div style={{
              background: 'linear-gradient(135deg, #18181b, #27272a)', borderRadius: 16, padding: 24,
              width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,.15)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                  alignSelf: 'flex-start', background: '#374151', padding: '10px 16px',
                  borderRadius: '14px 14px 14px 4px', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                  </div>
                  <div>
                    <div style={{ color: '#9ca3af', fontSize: 11 }}>Audio -- 0:34</div>
                    <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
                      {Array.from({ length: 24 }).map((_, i) => (
                        <div key={i} style={{ width: 3, height: 4 + Math.random() * 16, background: '#6b7280', borderRadius: 2 }} />
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{
                  alignSelf: 'flex-start', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.2)',
                  padding: '10px 16px', borderRadius: 12, maxWidth: '90%',
                }}>
                  <div style={{ color: '#22c55e', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Transcricao automatica</div>
                  <div style={{ color: '#d1d5db', fontSize: 13 }}>"Ola, quero comprar 50 camisetas personalizadas pra semana que vem, voces conseguem?"</div>
                </div>

                <div style={{
                  alignSelf: 'flex-end', background: '#22c55e', padding: '10px 16px',
                  borderRadius: '14px 14px 4px 14px', maxWidth: '90%',
                }}>
                  <div style={{ color: '#fff', fontSize: 13, lineHeight: 1.5 }}>
                    Conseguimos sim. Vou te enviar o catalogo com precos e opcoes de arte.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="planos" style={{ padding: '96px 24px', background: '#fafafa' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
              Planos
            </h2>
            <p style={{ color: '#71717a', fontSize: 17, maxWidth: 500, margin: '0 auto' }}>
              PIX ou cartao. Sem fidelidade.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {plans.map((p, i) => (
              <div key={i} className="card-hover" style={{
                background: '#fff',
                border: p.popular ? '2px solid #22c55e' : '1px solid #e4e4e7',
                borderRadius: 16, padding: 32, position: 'relative',
                display: 'flex', flexDirection: 'column',
              }}>
                {p.popular && (
                  <div style={{
                    position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                    background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 700,
                    padding: '4px 16px', borderRadius: 20,
                  }}>
                    Popular
                  </div>
                )}
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{p.name}</h3>
                  <div style={{ color: '#71717a', fontSize: 13 }}>{p.msgs} &middot; {p.agents}</div>
                </div>
                <div style={{ marginBottom: 24 }}>
                  <span style={{ fontSize: 14, color: '#71717a', verticalAlign: 'top' }}>R$</span>
                  <span style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-0.03em' }}>{p.price}</span>
                  <span style={{ fontSize: 14, color: '#71717a' }}>/mes</span>
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, flex: 1 }}>
                  {p.features.map((f, j) => (
                    <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#3f3f46' }}>
                      <span className="check-icon" /> {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={`/register?plan=${p.slug}`}
                  className={p.popular ? 'btn-green' : 'btn-outline'}
                  style={{ textAlign: 'center', width: '100%', padding: '12px 0' }}
                >
                  Assinar {p.name}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Perguntas frequentes
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {faqs.map((f, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid #e4e4e7', borderRadius: 12, overflow: 'hidden',
                  background: '#fff',
                }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: '100%', padding: '18px 24px', background: 'none', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#18181b', textAlign: 'left',
                  }}
                >
                  {f.q}
                  <span style={{
                    fontSize: 20, color: '#a1a1aa', transition: 'transform .2s',
                    transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0deg)',
                  }}>
                    +
                  </span>
                </button>
                <div
                  className="faq-answer"
                  style={{
                    maxHeight: openFaq === i ? 200 : 0,
                    padding: openFaq === i ? '0 24px 18px' : '0 24px 0',
                  }}
                >
                  <p style={{ color: '#71717a', fontSize: 14, lineHeight: 1.7 }}>{f.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section style={{
        padding: '96px 24px',
        background: 'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', marginBottom: 16 }}>
            Teste o AutoZap
          </h2>
          <p style={{ color: '#a1a1aa', fontSize: 17, marginBottom: 36, lineHeight: 1.6 }}>
            Cria a conta, conecta o WhatsApp e ve se faz sentido pro seu negocio.
          </p>
          <a href="/register" className="btn-green btn-green-lg">
            Criar conta
          </a>
          <p style={{ color: '#71717a', fontSize: 13, marginTop: 16 }}>
            Setup em 15 minutos &middot; Suporte incluso &middot; Cancele quando quiser
          </p>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ padding: '48px 24px', borderTop: '1px solid #e4e4e7', background: '#fff' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 18, color: '#18181b' }}>
            AutoZap
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <span onClick={() => scrollTo('funcionalidades')} style={{ cursor: 'pointer', fontSize: 13, color: '#71717a' }}>Funcionalidades</span>
            <span onClick={() => scrollTo('planos')} style={{ cursor: 'pointer', fontSize: 13, color: '#71717a' }}>Planos</span>
            <span onClick={() => scrollTo('faq')} style={{ cursor: 'pointer', fontSize: 13, color: '#71717a' }}>FAQ</span>
            <a href="/login" style={{ fontSize: 13, color: '#71717a', textDecoration: 'none' }}>Login</a>
            <a href="/register" style={{ fontSize: 13, color: '#71717a', textDecoration: 'none' }}>Registro</a>
          </div>
          <p style={{ color: '#a1a1aa', fontSize: 13, width: '100%', textAlign: 'center', marginTop: 24 }}>
            &copy; 2026 AutoZap. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  )
}
