'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { AutoZapLogo } from '@/components/ui/AutoZapLogo'

/* ─── FAQ data ─── */
const faqs = [
  { q: 'Preciso de CNPJ para usar?', a: 'Não! Qualquer pessoa física ou jurídica pode criar uma conta e começar a usar o AutoZap imediatamente.' },
  { q: 'Como posso começar?', a: 'Crie sua conta, escolha um plano e comece a usar imediatamente. O setup leva menos de 15 minutos.' },
  { q: 'Como funciona a IA?', a: 'Nossa IA responde automaticamente às mensagens dos seus clientes, classifica leads, transcreve áudios e sugere respostas. Tudo integrado ao WhatsApp.' },
  { q: 'Integra com Zapier?', a: 'Sim! Oferecemos integração nativa com Zapier, além de webhooks e API aberta para conectar com qualquer sistema.' },
  { q: 'Posso cancelar quando quiser?', a: 'Sim, sem multa e sem burocracia. Cancele a qualquer momento direto no painel.' },
  { q: 'Quantos atendentes posso ter?', a: 'Depende do plano. O Starter permite 5 membros, o Pro 10, o Enterprise 30 e o Unlimited é ilimitado.' },
]

/* ─── Features data ─── */
const features = [
  { icon: '📬', title: 'Inbox unificado', desc: 'Todas as conversas do WhatsApp num só lugar. Atribuição, filtros e respostas rápidas.' },
  { icon: '👥', title: 'CRM completo', desc: 'Contatos, tags, campos personalizados, importação em massa e timeline completa.' },
  { icon: '📊', title: 'Pipeline de vendas', desc: 'Funil kanban com arrasta e solta, tarefas, follow-up automático e previsão de receita.' },
  { icon: '🚀', title: 'Campanhas em massa', desc: 'Dispare para milhares com segmentação inteligente, agendamento e métricas em tempo real.' },
  { icon: '🤖', title: 'IA integrada', desc: 'Responde, classifica, transcreve áudio automaticamente. Seu assistente de vendas 24h.' },
  { icon: '⚡', title: 'Automações visuais', desc: '28 tipos de nós, editor visual drag-and-drop. Crie flows sem programar.' },
]

/* ─── Plans data ─── */
const plans = [
  { slug: 'starter', name: 'Starter', price: '149,99', msgs: '10.000 mensagens/mês', agents: '3 membros', popular: false, features: ['3 canais WhatsApp', '5 automações de flow', '10.000 contatos', '5.000 respostas de IA por mês', 'Campanhas ilimitadas', 'Agendamento Google Calendar', 'Pipeline de vendas'] },
  { slug: 'pro', name: 'Pro', price: '299,99', msgs: '50.000 mensagens/mês', agents: '10 membros', popular: true, features: ['10 canais WhatsApp', '20 automações de flow', '50.000 contatos', '30.000 respostas de IA por mês', 'Campanhas ilimitadas', '50 produtos no catálogo', 'Transcrição de áudio', 'Relatórios e exportação'] },
  { slug: 'enterprise', name: 'Enterprise', price: '599,99', msgs: '200.000 mensagens/mês', agents: '30 membros', popular: false, features: ['30 canais WhatsApp', 'Automações de flow ilimitadas', '100.000 contatos', '100.000 respostas de IA por mês', 'Campanhas ilimitadas', '500 produtos no catálogo', 'Transcrição de áudio', 'Relatórios e exportação'] },
  { slug: 'unlimited', name: 'Unlimited', price: '999,99', msgs: 'Mensagens ilimitadas', agents: 'Membros ilimitados', popular: false, features: ['Canais ilimitados', 'Automações ilimitadas', 'Contatos ilimitados', 'Respostas de IA ilimitadas', 'Produtos ilimitados', 'API sem limites', 'Suporte dedicado'] },
]

/* ─── Steps data ─── */
const steps = [
  { num: '1', title: 'Conecte seu WhatsApp', desc: 'Escaneie o QR Code ou use a API oficial Gupshup. Em menos de 2 minutos.' },
  { num: '2', title: 'Configure automações', desc: 'Use nosso editor visual para criar flows de atendimento, vendas e follow-up.' },
  { num: '3', title: 'Venda no piloto automático', desc: 'A IA cuida do atendimento enquanto você foca no que importa: crescer.' },
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

  // Scroll pra seção se URL tem hash (#planos)
  useEffect(() => {
    if (authChecked && window.location.hash) {
      const id = window.location.hash.replace('#', '')
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
      }, 300)
    }
  }, [authChecked])

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
          <AutoZapLogo variant="white" size="md" />

          {/* Desktop links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="nav-desktop">
            <span onClick={() => scrollTo('funcionalidades')} style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#71717a', transition: 'color .2s' }}>Funcionalidades</span>
            <span onClick={() => scrollTo('planos')} style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#71717a' }}>Planos</span>
            <span onClick={() => scrollTo('faq')} style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#71717a' }}>FAQ</span>
            <a href="/login" className="btn-outline" style={{ padding: '8px 20px', fontSize: 14 }}>Entrar</a>
            <a href="/register" className="btn-green" style={{ padding: '8px 20px', fontSize: 14 }}>Começar agora</a>
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
              <a href="/register" className="btn-green" style={{ flex: 1, textAlign: 'center' }}>Começar agora</a>
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
          <div className="fade-up" style={{
            display: 'inline-block', background: '#dcfce7', color: '#16a34a', fontSize: 13, fontWeight: 600,
            padding: '6px 16px', borderRadius: 20, marginBottom: 24,
          }}>
            🚀 Configure em menos de 15 minutos
          </div>
          <h1 className="fade-up fade-up-d1" style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.1, color: '#18181b', marginBottom: 20, letterSpacing: '-0.02em' }}>
            O CRM com WhatsApp<br />que <span style={{ color: '#22c55e' }}>vende por você</span>
          </h1>
          <p className="fade-up fade-up-d2" style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: '#71717a', maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.6 }}>
            Automatize atendimento, vendas e campanhas com IA que entende até áudio. Tudo em um só lugar.
          </p>
          <div className="fade-up fade-up-d3" style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/register" className="btn-green btn-green-lg">Começar agora</a>
            <button onClick={() => scrollTo('funcionalidades')} className="btn-outline" style={{ padding: '16px 36px', fontSize: 17 }}>Ver demonstração</button>
          </div>
        </div>

        {/* Hero mockup placeholder */}
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
              {/* Fake browser bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                <div style={{ flex: 1, background: '#374151', borderRadius: 6, height: 28, marginLeft: 12, display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
                  <span style={{ color: '#9ca3af', fontSize: 12 }}>app.autozap.com/inbox</span>
                </div>
              </div>
              {/* Fake inbox UI */}
              <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 260 }}>
                <div style={{ width: '30%', background: '#1f2937', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['João Silva', 'Maria Santos', 'Pedro Oliveira', 'Ana Costa'].map((name, i) => (
                    <div key={i} style={{
                      background: i === 0 ? 'rgba(34,197,94,.15)' : '#374151',
                      borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: `hsl(${i * 80}, 60%, 50%)`, flexShrink: 0 }} />
                      <div>
                        <div style={{ color: '#f3f4f6', fontSize: 12, fontWeight: 600 }}>{name}</div>
                        <div style={{ color: '#9ca3af', fontSize: 11 }}>Última mensagem...</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1, background: '#111827', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8 }}>
                  <div style={{ alignSelf: 'flex-start', background: '#374151', color: '#e5e7eb', padding: '8px 14px', borderRadius: '12px 12px 12px 4px', fontSize: 13, maxWidth: '70%' }}>
                    Oi, quero saber sobre os planos 😊
                  </div>
                  <div style={{ alignSelf: 'flex-end', background: '#22c55e', color: '#fff', padding: '8px 14px', borderRadius: '12px 12px 4px 12px', fontSize: 13, maxWidth: '70%' }}>
                    Olá João! Temos planos a partir de R$149,99/mês. Posso te ajudar a escolher o melhor? 🤖
                  </div>
                  <div style={{ alignSelf: 'flex-start', background: '#374151', color: '#e5e7eb', padding: '8px 14px', borderRadius: '12px 12px 12px 4px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🎤</span> <span style={{ color: '#22c55e', fontSize: 11 }}>Áudio transcrito pela IA</span>
                  </div>
                  <div style={{ alignSelf: 'flex-end', background: '#22c55e', color: '#fff', padding: '8px 14px', borderRadius: '12px 12px 4px 12px', fontSize: 13, maxWidth: '70%' }}>
                    Entendi! Você quer o plano Pro. Vou te enviar o link 🚀
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SOCIAL PROOF BAR ═══ */}
      <section style={{ padding: '48px 24px', background: '#fafafa', borderTop: '1px solid #f4f4f5', borderBottom: '1px solid #f4f4f5' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ color: '#a1a1aa', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 32 }}>
            Usado por empresas que querem vender mais
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(32px, 6vw, 80px)', flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { value: '+500', label: 'Empresas' },
              { value: '+1M', label: 'Mensagens enviadas' },
              { value: '+50K', label: 'Leads convertidos' },
              { value: '4.9★', label: 'Avaliação média' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, color: '#18181b' }}>{s.value}</div>
                <div style={{ fontSize: 13, color: '#71717a', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="funcionalidades" style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 20, display: 'inline-block', marginBottom: 16 }}>
              Funcionalidades
            </span>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
              Tudo que você precisa para vender mais
            </h2>
            <p style={{ color: '#71717a', fontSize: 17, maxWidth: 560, margin: '0 auto' }}>
              Uma plataforma completa para transformar WhatsApp em máquina de vendas.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            {features.map((f, i) => (
              <div key={i} className="card-hover" style={{
                background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12,
                padding: 28, cursor: 'default',
              }}>
                <div style={{ fontSize: 36, marginBottom: 16 }}>{f.icon}</div>
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
            <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 20, display: 'inline-block', marginBottom: 16 }}>
              Como funciona
            </span>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Comece a vender em 3 passos
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
            <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 20, display: 'inline-block', marginBottom: 20 }}>
              🤖 Inteligência Artificial
            </span>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
              IA que entende <span style={{ color: '#22c55e' }}>áudio</span>
            </h2>
            <p style={{ color: '#71717a', fontSize: 17, lineHeight: 1.7, marginBottom: 24 }}>
              Seu cliente manda áudio? A IA transcreve e responde como se fosse texto. <strong style={{ color: '#18181b' }}>Único CRM do mercado com essa tecnologia.</strong>
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {['Transcrição automática de áudios', 'Respostas inteligentes com contexto', 'Classificação automática de leads', 'Sugestão de respostas para atendentes'].map((item, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: '#3f3f46' }}>
                  <span style={{ color: '#22c55e', fontSize: 18, fontWeight: 700 }}>✓</span> {item}
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
                    <span style={{ fontSize: 18 }}>🎤</span>
                  </div>
                  <div>
                    <div style={{ color: '#9ca3af', fontSize: 11 }}>Áudio • 0:34</div>
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
                  <div style={{ color: '#22c55e', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>🤖 Transcrição automática</div>
                  <div style={{ color: '#d1d5db', fontSize: 13 }}>"Olá, quero comprar 50 camisetas personalizadas pra semana que vem, vocês conseguem?"</div>
                </div>

                <div style={{
                  alignSelf: 'flex-end', background: '#22c55e', padding: '10px 16px',
                  borderRadius: '14px 14px 4px 14px', maxWidth: '90%',
                }}>
                  <div style={{ color: '#fff', fontSize: 13, lineHeight: 1.5 }}>
                    Claro! Temos capacidade para 50 camisetas personalizadas. Vou te enviar nosso catálogo e preços. Qual seria a arte? 🎨
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
            <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 20, display: 'inline-block', marginBottom: 16 }}>
              Planos
            </span>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
              Escolha o plano ideal
            </h2>
            <p style={{ color: '#71717a', fontSize: 17, maxWidth: 500, margin: '0 auto' }}>
              Pagamento seguro via PIX ou cartão. Cancele quando quiser.
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
                  <span style={{ fontSize: 14, color: '#71717a' }}>/mês</span>
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, flex: 1 }}>
                  {p.features.map((f, j) => (
                    <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#3f3f46' }}>
                      <span style={{ color: '#22c55e', fontWeight: 700 }}>✓</span> {f}
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
            <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 20, display: 'inline-block', marginBottom: 16 }}>
              FAQ
            </span>
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
            Pronto pra automatizar suas vendas?
          </h2>
          <p style={{ color: '#a1a1aa', fontSize: 17, marginBottom: 36, lineHeight: 1.6 }}>
            Junte-se a mais de 500 empresas que já vendem no piloto automático com AutoZap.
          </p>
          <a href="/register" className="btn-green btn-green-lg">
            Começar agora agora
          </a>
          <p style={{ color: '#71717a', fontSize: 13, marginTop: 16 }}>
            Setup em 15 minutos &middot; Suporte incluso &middot; Cancele quando quiser
          </p>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ padding: '48px 24px', borderTop: '1px solid #e4e4e7', background: '#fff' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
          <AutoZapLogo variant="white" size="sm" />
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
