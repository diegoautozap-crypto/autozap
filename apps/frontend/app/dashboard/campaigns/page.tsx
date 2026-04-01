'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignApi, channelApi, contactApi } from '@/lib/api'
import { Tag } from 'lucide-react'
import { toast } from 'sonner'
import { Plus, RefreshCw, X, Send, Upload, Play, Pause, Loader2, ChevronLeft, ChevronRight, BarChart2, CheckCheck, AlertCircle, TrendingUp, Trash2, FileText, Clock, Calendar, Megaphone, Shuffle, Search, Download } from 'lucide-react'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useT } from '@/lib/i18n'
import { usePermissions } from '@/store/permissions.store'

const S: Record<string, { color: string; bg: string; dot: string; label: string; bar: string }> = {
  running:   { color: '#16a34a', bg: '#f0fdf4', dot: '#22c55e', label: 'Enviando',  bar: '#22c55e' },
  completed: { color: '#16a34a', bg: '#f0fdf4', dot: '#22c55e', label: 'Concluída', bar: '#22c55e' },
  draft:     { color: 'var(--text-muted)', bg: 'var(--bg-input)',  dot: 'var(--text-faintest)', label: 'Rascunho',  bar: 'var(--text-faintest)' },
  paused:    { color: '#d97706', bg: '#fffbeb',  dot: '#f59e0b', label: 'Pausada',   bar: '#f59e0b' },
  failed:    { color: '#dc2626', bg: '#fef2f2',  dot: '#ef4444', label: 'Falhou',    bar: '#ef4444' },
  scheduled: { color: '#7c3aed', bg: '#f5f3ff',  dot: '#8b5cf6', label: 'Agendada',  bar: '#8b5cf6' },
}

const PAGE_SIZE = 10

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '13.5px', outline: 'none',
  color: 'var(--text)', fontFamily: 'inherit', transition: 'all 0.15s',
}

function speedHint(messagesPerMin: number, contactsText: string, channelCount: number): string {
  const totalContacts = contactsText.split('\n').filter(Boolean).length
  const effectiveRate = messagesPerMin * Math.max(channelCount, 1)
  const mins = totalContacts > 0 ? Math.ceil(totalContacts / effectiveRate) : null
  const speedLabel = effectiveRate >= 1200
    ? `⚡ ${effectiveRate.toLocaleString()}/min (${channelCount} canal${channelCount > 1 ? 'is' : ''} em paralelo)`
    : effectiveRate >= 600 ? `🚀 ${effectiveRate.toLocaleString()}/min` : `🐢 ${effectiveRate.toLocaleString()}/min`
  if (!mins) return speedLabel
  const timeLabel = mins < 60 ? `${mins}min` : `${Math.floor(mins / 60)}h${mins % 60 > 0 ? `${mins % 60}min` : ''}`
  return `${speedLabel} · ${totalContacts.toLocaleString()} contatos = ~${timeLabel}`
}

export default function CampaignsPage() {
  const t = useT()
  const { canCreateCampaigns, canManageCampaigns, canDelete } = usePermissions()
  const queryClient = useQueryClient()
  const [showModal, setShowModal]               = useState(false)
  const [contactsText, setContactsText]         = useState('')
  const [curlCopies, setCurlCopies]             = useState<string[]>([''])
  const [campaignName, setCampaignName]         = useState('')
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])
  const [messagesPerMin, setMessagesPerMin]     = useState(1200)
  const [selectedCamp, setSelectedCamp]         = useState<any>(null)
  const [page, setPage]                         = useState(1)
  const [useTemplate, setUseTemplate]           = useState(true)
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
  const [scheduleMode, setScheduleMode]         = useState<'now' | 'scheduled'>('now')
  const [scheduledAt, setScheduledAt]           = useState('')
  const [contactMode, setContactMode]           = useState<'manual' | 'segment'>('manual')
  const [selectedTagIds, setSelectedTagIds]     = useState<string[]>([])
  const [segNoInteraction, setSegNoInteraction] = useState<number>(0)
  const [segOrigin, setSegOrigin]               = useState<string>('')
  const [segCustomField, setSegCustomField]     = useState<string>('')
  const [segCustomValue, setSegCustomValue]     = useState<string>('')
  const [recurrence, setRecurrence]             = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none')
  const [previewCount, setPreviewCount]         = useState<number | null>(null)
  const [loadingPreview, setLoadingPreview]     = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: campaigns, isLoading, refetch } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => { const { data } = await campaignApi.get('/campaigns'); return data.data },
    refetchInterval: 5000,
  })
  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data || [] },
  })
  const { data: tags = [] } = useQuery({
    queryKey: ['tags-campaign'],
    queryFn: async () => { const { data } = await contactApi.get('/tags'); return data.data || [] },
  })
  const { data: templates = [] } = useQuery({
    queryKey: ['templates', selectedChannels[0]],
    queryFn: async () => { const { data } = await campaignApi.get(`/templates?channelId=${selectedChannels[0]}`); return data.data || [] },
    enabled: !!selectedChannels[0] && useTemplate,
  })
  const { data: progress } = useQuery({
    queryKey: ['progress', selectedCamp?.id],
    queryFn: async () => { const { data } = await campaignApi.get(`/campaigns/${selectedCamp.id}/progress`); return data.data },
    enabled: !!selectedCamp?.id,
    refetchInterval: 3000,
  })

  const totalCampaigns     = campaigns?.length ?? 0
  const totalPages         = Math.ceil(totalCampaigns / PAGE_SIZE)
  const paginatedCampaigns = campaigns?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? []

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setContactsText(ev.target?.result as string)
    reader.readAsText(file)
  }

  const resetModal = () => {
    setCampaignName(''); setContactsText(''); setCurlCopies([''])
    setSelectedChannels([]); setSelectedTemplates([]); setSelectedTagIds([])
    setUseTemplate(true); setScheduleMode('now'); setScheduledAt('')
    setMessagesPerMin(1200); setContactMode('manual')
    setSegNoInteraction(0); setSegOrigin(''); setSegCustomField(''); setSegCustomValue('')
    setPreviewCount(null); setRecurrence('none')
  }

  const toggleChannel  = (id: string) => setSelectedChannels(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  const toggleTemplate = (id: string) => setSelectedTemplates(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  const addCurlCopy    = () => setCurlCopies(prev => [...prev, ''])
  const removeCurlCopy = (i: number) => setCurlCopies(prev => prev.filter((_, idx) => idx !== i))
  const updateCurlCopy = (i: number, val: string) => setCurlCopies(prev => prev.map((c, idx) => idx === i ? val : c))

  const validCurlCopies = curlCopies.filter(c => c.trim())
  const buildFilter = () => {
    const f: any = {}
    if (selectedTagIds.length > 0) f.tagIds = selectedTagIds
    if (segNoInteraction > 0) f.noInteractionDays = segNoInteraction
    if (segOrigin) f.origin = segOrigin
    if (segCustomField && segCustomValue) { f.customField = segCustomField; f.customValue = segCustomValue }
    return f
  }
  const hasSegmentFilter = selectedTagIds.length > 0 || segNoInteraction > 0 || segOrigin || (segCustomField && segCustomValue)
  const hasContacts = contactMode === 'segment' ? hasSegmentFilter : contactsText.trim().length > 0

  const loadPreview = async () => {
    if (!hasSegmentFilter) return
    setLoadingPreview(true)
    try {
      const { data } = await campaignApi.post('/contacts/preview', buildFilter())
      setPreviewCount(data.data.total)
    } catch { setPreviewCount(null) }
    finally { setLoadingPreview(false) }
  }
  const isValid = campaignName && selectedChannels.length > 0 &&
    (useTemplate ? selectedTemplates.length > 0 : validCurlCopies.length > 0)

  const createMutation = useMutation({
    mutationFn: async () => {
      const [primaryChannel, ...extraChannels] = selectedChannels
      const payload: any = { channelId: primaryChannel, extraChannelIds: extraChannels, name: campaignName, messageTemplate: ' ', messagesPerMin }
      if (useTemplate) {
        payload.templateId  = selectedTemplates[0]
        if (selectedTemplates.length > 1) payload.templateIds = selectedTemplates
      } else {
        payload.curlTemplate = validCurlCopies[0]
        payload.copies       = validCurlCopies
      }
      if (scheduleMode === 'scheduled' && scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString()
      if (recurrence !== 'none') {
        payload.recurrenceType = recurrence
        if (contactMode === 'segment' && hasSegmentFilter) payload.recurrenceFilter = buildFilter()
      }

      toast.info(t('campaigns.toast.creating'))
      const { data: campData } = await campaignApi.post('/campaigns', payload)
      const campId = campData.data.id

      if (contactMode === 'segment' && hasSegmentFilter) {
        toast.info(t('campaigns.toast.loadingSegment'))
        const { data: filterResult } = await campaignApi.post(`/campaigns/${campId}/contacts/by-filter`, buildFilter())
        toast.info(`${filterResult?.data?.imported || 0} ${t('campaigns.toast.contactsLoaded')}`)
      } else {
        const rows = contactsText.split('\n').filter(Boolean).map(line => {
          const parts = line.split(','); const phone = parts[0]?.trim().replace(/\D/g, '')
          return { phone, name: parts.slice(1).join(',').trim() || phone, message: parts.slice(1).join(',').trim() || '' }
        }).filter(r => r.phone && r.phone.length >= 8)
        if (rows.length > 0) {
          toast.info(`${t('campaigns.toast.importing')} ${rows.length} ${t('campaigns.toast.contacts')}...`)
          await campaignApi.post(`/campaigns/${campId}/contacts/import`, { rows })
        }
      }

      if (scheduleMode === 'now') {
        toast.info(t('campaigns.toast.starting'))
        await campaignApi.post(`/campaigns/${campId}/start`)
      }
      return campData.data
    },
    onSuccess: camp => {
      toast.success(scheduleMode === 'scheduled' ? t('campaigns.toast.scheduled') : t('campaigns.toast.createdAndStarted'))
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setShowModal(false); setSelectedCamp(camp); resetModal()
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || t('campaigns.toast.error')),
  })

  const startMutation  = useMutation({ mutationFn: async (id: string) => { await campaignApi.post(`/campaigns/${id}/start`) }, onSuccess: () => { toast.success(t('campaigns.toast.started')); queryClient.invalidateQueries({ queryKey: ['campaigns'] }) }, onError: (err: any) => toast.error(err?.response?.data?.error?.message || t('campaigns.toast.error')) })
  const pauseMutation  = useMutation({ mutationFn: async (id: string) => { await campaignApi.post(`/campaigns/${id}/pause`) }, onSuccess: () => { toast.success(t('campaigns.toast.paused')); queryClient.invalidateQueries({ queryKey: ['campaigns'] }) } })
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await campaignApi.delete(`/campaigns/${id}`) },
    onSuccess: () => { toast.success(t('campaigns.toast.deleted')); queryClient.invalidateQueries({ queryKey: ['campaigns'] }); setSelectedCamp(null) },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || t('campaigns.toast.error')),
  })

  const prog         = progress || selectedCamp
  const total        = prog?.total || prog?.total_contacts || 0
  const sent         = prog?.sent  || prog?.sent_count     || 0
  const delivered    = prog?.delivered || prog?.delivered_count || 0
  const read         = prog?.read  || prog?.read_count     || 0
  const failed       = prog?.failed || prog?.failed_count  || 0
  const pct          = total > 0 ? Math.round((sent / total) * 100) : 0
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0
  const readRate     = sent > 0 ? Math.round((read / sent) * 100) : 0
  const minDateTime  = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)

  const Lbl = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.01em' }}>{children}</label>
  )

  return (
    <div className="mobile-page" style={{ padding: '28px 32px', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* Header */}
      <div className="mobile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', margin: 0 }}>{t('campaigns.title')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', marginTop: '4px' }}>{t('campaigns.subtitle')}</p>
        </div>
        <div className="mobile-header-actions" style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => refetch()} style={{ padding: '8px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card)'}>
            <RefreshCw size={13} /> {t('campaigns.refresh')}
          </button>
          {canCreateCampaigns() && (
          <button onClick={() => setShowModal(true)} style={{ padding: '8px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#16a34a'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#22c55e'}>
            <Plus size={14} /> {t('campaigns.new')}
          </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>

        {/* Tabela */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)' }}>
            {isLoading ? (
              <div style={{ flex: 1, padding: '20px' }}>
                <ListSkeleton rows={5} />
              </div>
            ) : campaigns?.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '60px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Megaphone size={22} color="var(--text-faint)" />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>{t('campaigns.noCampaigns')}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>{t('campaigns.createFirst')}</p>
                </div>
                {canCreateCampaigns() && (
                <button onClick={() => setShowModal(true)} style={{ padding: '8px 18px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  + {t('campaigns.createCampaign')}
                </button>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 120px 120px 100px', gap: '8px', padding: '11px 20px', background: 'var(--bg-input)', borderBottom: '1px solid var(--divider)' }}>
                  {[t('campaigns.campaign'), 'Total', t('dashboard.sent'), 'Status', t('campaigns.actions')].map(h => (
                    <span key={h} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                  ))}
                </div>
                {paginatedCampaigns.map((camp: any) => {
                  const s = S[camp.status] || S.draft
                  const p = camp.total_contacts > 0 ? Math.round((camp.sent_count / camp.total_contacts) * 100) : 0
                  const isSelected = selectedCamp?.id === camp.id
                  return (
                    <div key={camp.id} onClick={() => setSelectedCamp(camp)}
                      style={{ display: 'grid', gridTemplateColumns: '2fr 80px 120px 120px 100px', gap: '8px', padding: '13px 20px', borderBottom: '1px solid var(--divider)', cursor: 'pointer', background: isSelected ? '#f0fdf4' : 'var(--bg-card)', transition: 'background 0.1s', alignItems: 'center', borderLeft: `3px solid ${isSelected ? '#22c55e' : 'transparent'}` }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-input)' }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card)' }}>
                      <div>
                        <div style={{ fontWeight: 500, color: 'var(--text)', fontSize: '13.5px', letterSpacing: '-0.01em', marginBottom: '2px' }}>{camp.name}</div>
                        {camp.scheduled_at && camp.status === 'scheduled' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#7c3aed', fontWeight: 500, marginTop: '2px' }}>
                            <Clock size={10} />{new Date(camp.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        <div style={{ height: '3px', background: 'var(--bg)', borderRadius: '99px', overflow: 'hidden', marginTop: '6px', width: '80%' }}>
                          <div style={{ width: `${p}%`, height: '100%', background: s.bar, borderRadius: '99px', transition: 'width 0.4s' }} />
                        </div>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{camp.total_contacts.toLocaleString()}</span>
                      <span style={{ color: 'var(--text)', fontSize: '13px' }}>
                        {camp.sent_count.toLocaleString()}
                        <span style={{ color: 'var(--text-faint)', fontSize: '11px', marginLeft: '4px' }}>({p}%)</span>
                      </span>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', background: s.bg, borderRadius: '6px' }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: s.color }}>{s.label}</span>
                      </div>
                      <div onClick={e => e.stopPropagation()}>
                        {camp.status === 'running' ? (
                          <button onClick={() => pauseMutation.mutate(camp.id)} style={{ padding: '5px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontWeight: 500 }}>
                            <Pause size={10} /> {t('campaigns.pause')}
                          </button>
                        ) : ['draft', 'paused'].includes(camp.status) ? (
                          <button onClick={() => startMutation.mutate(camp.id)} style={{ padding: '5px 10px', background: '#22c55e', border: 'none', color: '#fff', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Play size={10} fill="#fff" /> {t('campaigns.send')}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid var(--divider)', marginTop: 'auto' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCampaigns)} de {totalCampaigns}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '5px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? 'var(--text-faintest)' : 'var(--text-muted)', display: 'flex' }}><ChevronLeft size={13} /></button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => setPage(p)} style={{ padding: '5px 9px', background: p === page ? '#22c55e' : 'var(--bg-card)', border: `1px solid ${p === page ? '#22c55e' : 'var(--border)'}`, borderRadius: '6px', cursor: 'pointer', color: p === page ? '#fff' : 'var(--text-muted)', fontSize: '12px', fontWeight: p === page ? 700 : 400, minWidth: '30px' }}>{p}</button>
                      ))}
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '5px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? 'var(--text-faintest)' : 'var(--text-muted)', display: 'flex' }}><ChevronRight size={13} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Painel lateral */}
        <div className="mobile-full" style={{ width: '268px', flexShrink: 0 }}>
          {selectedCamp ? (
            <div style={{ background: '#161b27', borderRadius: '12px', overflow: 'hidden', position: 'sticky', top: 0, boxShadow: '0 4px 20px rgba(0,0,0,.15)' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: '10px' }}>
                  <p style={{ fontSize: '13.5px', fontWeight: 600, color: '#fff', margin: '0 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedCamp.name}</p>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 8px', background: 'rgba(34,197,94,0.15)', borderRadius: '5px' }}>
                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: (S[selectedCamp.status] || S.draft).dot }} />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: (S[selectedCamp.status] || S.draft).color }}>{(S[selectedCamp.status] || S.draft).label}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedCamp(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '2px', display: 'flex' }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)'}>
                  <X size={14} />
                </button>
              </div>
              <div style={{ padding: '16px 18px' }}>
                {selectedCamp.scheduled_at && selectedCamp.status === 'scheduled' && (
                  <div style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', display: 'flex', gap: '8px' }}>
                    <Calendar size={13} color="#a78bfa" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: '#a78bfa', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('campaigns.scheduledFor')}</p>
                      <p style={{ fontSize: '12px', color: '#c4b5fd', margin: 0 }}>{new Date(selectedCamp.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                )}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('campaigns.progress')}</span>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: '#22c55e', letterSpacing: '-0.03em' }}>{pct}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#22c55e', borderRadius: '99px', transition: 'width 0.5s ease', boxShadow: '0 0 8px rgba(34,197,94,0.4)' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
                  {[
                    { label: 'Total',                    value: total,     color: 'rgba(255,255,255,0.5)', icon: BarChart2 },
                    { label: t('campaigns.sentLabel'),  value: sent,      color: '#60a5fa',               icon: Send },
                    { label: t('campaigns.delivered'), value: delivered, color: '#22c55e',               icon: CheckCheck },
                    { label: t('campaigns.read'),     value: read,      color: '#a78bfa',               icon: TrendingUp },
                    { label: t('campaigns.failures'),    value: failed,    color: '#f87171',               icon: AlertCircle },
                  ].map(({ label, value, color, icon: Icon }) => (
                    <div key={label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '9px 11px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                        <Icon size={11} color={color} />
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
                {sent > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
                    {[
                      { rate: deliveryRate, label: t('campaigns.deliveredLower'), color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.2)',   icon: CheckCheck },
                      { rate: readRate,     label: t('campaigns.readLower'),     color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)', icon: TrendingUp },
                    ].map(({ rate, label, color, bg, border, icon: Icon }) => (
                      <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '7px', padding: '8px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Icon size={12} color={color} />
                          <span style={{ fontSize: '12px', color, fontWeight: 600 }}>{rate}% {label}</span>
                        </div>
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{sent.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {canManageCampaigns() && selectedCamp.status === 'running' && (
                    <button onClick={() => pauseMutation.mutate(selectedCamp.id)}
                      style={{ width: '100%', padding: '9px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'}>
                      <Pause size={13} /> {t('campaigns.pauseCampaign')}
                    </button>
                  )}
                  {canManageCampaigns() && ['draft', 'paused', 'scheduled'].includes(selectedCamp.status) && (
                    <button onClick={() => startMutation.mutate(selectedCamp.id)}
                      style={{ width: '100%', padding: '9px', background: '#22c55e', border: 'none', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#16a34a'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#22c55e'}>
                      <Play size={13} fill="#fff" /> {selectedCamp.status === 'scheduled' ? t('campaigns.sendNow') : t('campaigns.send')}
                    </button>
                  )}
                  <button onClick={async () => {
                    try {
                      toast.info(t('campaigns.toast.exporting'))
                      const { data: result } = await campaignApi.get(`/campaigns/${selectedCamp.id}/contacts`)
                      const rows = (result.data || []).map((c: any) => ({
                        telefone: c.phone || '', nome: c.name || '', status: c.status || '',
                        erro: c.error_message || '', enviado_em: c.sent_at ? new Date(c.sent_at).toLocaleString('pt-BR') : '',
                      }))
                      if (rows.length === 0) { toast.error(t('campaigns.toast.noContacts')); return }
                      const { exportToExcel } = await import('@/lib/export')
                      exportToExcel(rows, `campanha_${selectedCamp.name.replace(/\s+/g, '_')}`, 'Contatos')
                      toast.success(`${rows.length} ${t('campaigns.toast.contactsExported')}`)
                    } catch { toast.error(t('campaigns.toast.exportError')) }
                  }}
                    style={{ width: '100%', padding: '9px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    <Download size={13} /> {t('campaigns.exportResults')}
                  </button>

                  {canDelete('/dashboard/campaigns') && ['draft', 'paused', 'completed', 'failed', 'scheduled'].includes(selectedCamp.status) && (
                    <button onClick={() => { if (window.confirm(`${t('campaigns.deleteCampaign')} "${selectedCamp.name}"?`)) deleteMutation.mutate(selectedCamp.id) }}
                      disabled={deleteMutation.isPending}
                      style={{ width: '100%', padding: '9px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#f87171', fontWeight: 500, opacity: deleteMutation.isPending ? 0.5 : 1 }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}>
                      {deleteMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                      {t('campaigns.deleteCampaign')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: '#161b27', borderRadius: '12px', padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <BarChart2 size={20} color="rgba(255,255,255,0.2)" />
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>{t('campaigns.selectCampaign')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>{t('campaigns.newCampaign')}</h2>
                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '3px' }}>{t('campaigns.configureMassSend')}</p>
              </div>
              <button onClick={() => { setShowModal(false); resetModal() }} style={{ background: 'var(--bg)', border: 'none', borderRadius: '7px', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px', display: 'flex' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--border)'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'}>
                <X size={15} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Nome */}
              <div>
                <Lbl>{t('campaigns.campaignName')}</Lbl>
                <input style={inp} placeholder={t('campaigns.campaignNamePlaceholder')} value={campaignName} onChange={e => setCampaignName(e.target.value)}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#22c55e'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(34,197,94,0.1)' }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border)'; (e.target as HTMLInputElement).style.boxShadow = 'none' }} />
              </div>

              {/* Canais */}
              <div>
                <Lbl>{t('campaigns.channelsLabel')}</Lbl>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(channels as any[]).map((ch: any) => {
                    const sel = selectedChannels.includes(ch.id)
                    return (
                      <div key={ch.id} onClick={() => toggleChannel(ch.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', cursor: 'pointer', border: `1.5px solid ${sel ? '#22c55e' : 'var(--border)'}`, background: sel ? '#f0fdf4' : 'var(--bg-input)', transition: 'all 0.1s' }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${sel ? '#22c55e' : 'var(--text-faintest)'}`, background: sel ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: sel ? '#15803d' : 'var(--text)' }}>{ch.name}</span>
                        {sel && <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>1.200/min</span>}
                      </div>
                    )
                  })}
                </div>
                {selectedChannels.length > 1 && (
                  <p style={{ fontSize: '12px', color: '#16a34a', marginTop: '6px', fontWeight: 600 }}>
                    ⚡ {selectedChannels.length} canais × 1.200/min = {(selectedChannels.length * 1200).toLocaleString()}/min total
                  </p>
                )}
              </div>

              {/* Toggle Template / cURL */}
              <div>
                <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: '9px', padding: '3px', gap: '2px', marginBottom: '13px' }}>
                  {[{ v: true, label: t('campaigns.savedTemplates') }, { v: false, label: t('campaigns.manualCurl') }].map(opt => (
                    <button key={String(opt.v)} onClick={() => { setUseTemplate(opt.v); setSelectedTemplates([]); setCurlCopies(['']) }}
                      style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, background: useTemplate === opt.v ? 'var(--bg-card)' : 'transparent', color: useTemplate === opt.v ? 'var(--text)' : 'var(--text-muted)', boxShadow: useTemplate === opt.v ? '0 1px 3px rgba(0,0,0,.08)' : 'none', transition: 'all 0.15s' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                {useTemplate ? (
                  // ── Modo Template: checkboxes múltiplos ──
                  selectedChannels.length > 0 ? (
                    (templates as any[]).length === 0 ? (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '13px 15px' }}>
                        <p style={{ fontSize: '13px', color: '#92400e', fontWeight: 500, margin: 0 }}>{t('campaigns.noTemplatesForChannel')}</p>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                            {t('campaigns.selectTemplates')}
                          </span>
                          {selectedTemplates.length > 0 && (
                            <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                              <Shuffle size={11} /> {selectedTemplates.length} {t('campaigns.selected')}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '0 0 8px' }}>
                          {t('campaigns.selectMultipleToRotate')}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                          {(templates as any[]).map((t: any) => {
                            const sel = selectedTemplates.includes(t.id)
                            return (
                              <div key={t.id} onClick={() => toggleTemplate(t.id)}
                                style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', border: `1.5px solid ${sel ? '#22c55e' : 'var(--border)'}`, background: sel ? '#f0fdf4' : 'var(--bg-input)', transition: 'all 0.1s' }}>
                                <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${sel ? '#22c55e' : 'var(--text-faintest)'}`, background: sel ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                                  {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: sel ? '#15803d' : 'var(--text)' }}>{t.name}</span>
                                    <span style={{ fontSize: '10px', background: sel ? '#dcfce7' : 'var(--bg)', color: sel ? '#15803d' : 'var(--text-faint)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>{t.category}</span>
                                  </div>
                                  <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body}</p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {selectedTemplates.length > 1 && (
                          <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '6px' }}>
                            🎲 {t('campaigns.eachContactReceivesRandom').replace('{count}', String(selectedTemplates.length))}
                          </p>
                        )}
                      </div>
                    )
                  ) : (
                    <div style={{ background: 'var(--bg-input)', borderRadius: '8px', padding: '14px 16px', textAlign: 'center', border: '1px solid var(--divider)' }}>
                      <p style={{ fontSize: '13px', color: 'var(--text-faint)', margin: 0 }}>{t('campaigns.selectChannelForTemplates')}</p>
                    </div>
                  )
                ) : (
                  // ── Modo cURL: múltiplas copies ──
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{t('campaigns.curlsRotated')}</span>
                      <button onClick={addCurlCopy} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', color: '#16a34a', fontWeight: 600, cursor: 'pointer' }}>
                        <Plus size={11} /> {t('campaigns.addCopy')}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {curlCopies.map((copy, i) => (
                        <div key={i}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <Shuffle size={11} color="var(--text-faint)" />
                            <span style={{ fontSize: '11px', color: 'var(--text-faint)', fontWeight: 600 }}>Copy {i + 1}</span>
                            {curlCopies.length > 1 && (
                              <button onClick={() => removeCurlCopy(i)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faintest)', padding: '2px', display: 'flex' }}
                                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)'}>
                                <X size={12} />
                              </button>
                            )}
                          </div>
                          <textarea style={{ ...inp, minHeight: '70px', resize: 'vertical' as const, fontFamily: 'ui-monospace, monospace', fontSize: '11.5px', lineHeight: 1.6 } as any}
                            placeholder="curl -X POST https://api.gupshup.io/..."
                            value={copy} onChange={e => updateCurlCopy(i, e.target.value)} />
                        </div>
                      ))}
                    </div>
                    {validCurlCopies.length > 1 && (
                      <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '6px' }}>
                        🎲 {validCurlCopies.length} copies — {t('campaigns.eachContactReceivesOneRandom')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Contatos */}
              <div>
                <Lbl>{t('campaigns.recipients')}</Lbl>
                <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: '9px', padding: '3px', gap: '2px', marginBottom: '10px' }}>
                  {[{ v: 'segment', label: t('campaigns.segment'), Icon: Tag }, { v: 'manual', label: t('campaigns.manualList'), Icon: Upload }].map(({ v, label, Icon }) => (
                    <button key={v} onClick={() => setContactMode(v as any)}
                      style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', transition: 'all 0.15s', background: contactMode === v ? 'var(--bg-card)' : 'transparent', color: contactMode === v ? 'var(--text)' : 'var(--text-muted)', boxShadow: contactMode === v ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
                      <Icon size={13} /> {label}
                    </button>
                  ))}
                </div>

                {contactMode === 'segment' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    {/* Passo 1: Selecione as tags */}
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>{t('campaigns.selectContactTags')}</p>
                      {tags.length === 0 ? (
                        <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{t('campaigns.noTagsRegistered')}</p>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {tags.map((tag: any) => {
                            const sel = selectedTagIds.includes(tag.id)
                            return (
                              <div key={tag.id} onClick={() => { setSelectedTagIds(prev => sel ? prev.filter(id => id !== tag.id) : [...prev, tag.id]); setPreviewCount(null) }}
                                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 11px', borderRadius: '99px', cursor: 'pointer', border: `1.5px solid ${sel ? (tag.color || '#22c55e') : 'var(--border)'}`, background: sel ? `${tag.color || '#22c55e'}12` : 'var(--bg-card)', fontSize: '12px', fontWeight: 500, transition: 'all 0.1s' }}>
                                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: tag.color || '#6b7280' }} />
                                <span style={{ color: sel ? (tag.color || '#22c55e') : 'var(--text)' }}>{tag.name}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Passo 2: Refinar (opcional, colapsável) */}
                    <details style={{ background: 'var(--bg-input)', border: '1px solid var(--divider)', borderRadius: '10px', padding: '0' }}>
                      <summary style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Plus size={12} /> {t('campaigns.refineSegment')}
                      </summary>
                      <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('campaigns.inactiveDays')}</p>
                            <input type="number" min="0" style={{ ...inp, padding: '7px 10px', fontSize: '12px' }} value={segNoInteraction || ''} placeholder="Ex: 30" onChange={e => { setSegNoInteraction(Number(e.target.value) || 0); setPreviewCount(null) }} />
                          </div>
                          <div>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('campaigns.contactOrigin')}</p>
                            <select style={{ ...inp, padding: '7px 10px', fontSize: '12px' }} value={segOrigin} onChange={e => { setSegOrigin(e.target.value); setPreviewCount(null) }}>
                              <option value="">{t('campaigns.anyOrigin')}</option>
                              <option value="manual">{t('campaigns.manualRegister')}</option>
                              <option value="csv_import">{t('campaigns.csvImport')}</option>
                              <option value="webhook">{t('campaigns.formWebhook')}</option>
                              <option value="whatsapp">WhatsApp</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('campaigns.filterByCustomField')}</p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <input style={{ ...inp, padding: '7px 10px', fontSize: '12px' }} placeholder={t('campaigns.fieldName')} value={segCustomField} onChange={e => { setSegCustomField(e.target.value); setPreviewCount(null) }} />
                            <input style={{ ...inp, padding: '7px 10px', fontSize: '12px' }} placeholder={t('common.value')} value={segCustomValue} onChange={e => { setSegCustomValue(e.target.value); setPreviewCount(null) }} />
                          </div>
                        </div>
                      </div>
                    </details>

                    {/* Preview */}
                    <button onClick={loadPreview} disabled={!hasSegmentFilter || loadingPreview}
                      style={{ width: '100%', padding: '9px', background: previewCount !== null ? '#f0fdf4' : hasSegmentFilter ? '#f0f9ff' : 'var(--bg-input)', border: `1px solid ${previewCount !== null ? '#bbf7d0' : hasSegmentFilter ? '#bae6fd' : 'var(--border)'}`, borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: hasSegmentFilter ? 'pointer' : 'not-allowed', color: previewCount !== null ? '#15803d' : hasSegmentFilter ? '#0369a1' : 'var(--text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      {loadingPreview ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : previewCount !== null ? <CheckCheck size={13} /> : <Search size={13} />}
                      {previewCount !== null ? `${previewCount} ${t('campaigns.contactsFound')}` : t('campaigns.previewContacts')}
                    </button>
                  </div>
                ) : (
                  <>
                    <div onClick={() => fileRef.current?.click()}
                      style={{ border: '2px dashed var(--border)', borderRadius: '8px', padding: '16px', textAlign: 'center', cursor: 'pointer', marginBottom: '8px', background: 'var(--bg-input)', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLDivElement).style.background = '#f0fdf4' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-input)' }}>
                      <Upload size={14} color="var(--text-faint)" style={{ margin: '0 auto 5px' }} />
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{t('campaigns.uploadCsv')} <strong style={{ color: 'var(--text)' }}>.csv</strong></p>
                    </div>
                    <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
                    <textarea style={{ ...inp, minHeight: '70px', resize: 'vertical' as const, fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: 1.6 } as any}
                      placeholder="5511999990001,Olá!" value={contactsText} onChange={e => setContactsText(e.target.value)} />
                    {contactsText && (
                      <p style={{ fontSize: '12px', color: '#16a34a', marginTop: '5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                        {contactsText.split('\n').filter(Boolean).length} {t('campaigns.contactsDetected')}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Velocidade */}
              <div>
                <Lbl>{t('campaigns.speedPerChannel')}</Lbl>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="number" min="1" max="1200" style={{ ...inp, width: '100px' } as any}
                    value={messagesPerMin}
                    onChange={e => {
                      const val = Number(e.target.value)
                      if (!isNaN(val)) setMessagesPerMin(Math.min(1200, Math.max(1, val)))
                    }}
                    onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#22c55e'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(34,197,94,0.1)' }}
                    onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border)'; (e.target as HTMLInputElement).style.boxShadow = 'none' }} />
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('campaigns.msgMinPerChannel')}</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '6px' }}>
                  {speedHint(messagesPerMin, contactsText, selectedChannels.length)}
                </p>
              </div>

              {/* Quando disparar */}
              <div>
                <Lbl>{t('campaigns.whenToSend')}</Lbl>
                <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: '9px', padding: '3px', gap: '2px', marginBottom: '12px' }}>
                  {[{ v: 'now', label: t('campaigns.sendNow'), Icon: Send }, { v: 'scheduled', label: t('campaigns.schedule'), Icon: Calendar }].map(({ v, label, Icon }) => (
                    <button key={v} onClick={() => setScheduleMode(v as any)}
                      style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, background: scheduleMode === v ? 'var(--bg-card)' : 'transparent', color: scheduleMode === v ? 'var(--text)' : 'var(--text-muted)', boxShadow: scheduleMode === v ? '0 1px 3px rgba(0,0,0,.08)' : 'none', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
                {scheduleMode === 'scheduled' && (
                  <div>
                    <input type="datetime-local" min={minDateTime} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={inp} />
                    {scheduledAt && (
                      <p style={{ fontSize: '12px', color: '#7c3aed', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 }}>
                        <Clock size={11} /> {new Date(scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Recorrência */}
              <div>
                <Lbl>{t('campaigns.repeatCampaign')}</Lbl>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[
                    { v: 'none', label: t('campaigns.noRepeat') },
                    { v: 'daily', label: t('campaigns.daily') },
                    { v: 'weekly', label: t('campaigns.weekly') },
                    { v: 'monthly', label: t('campaigns.monthly') },
                  ].map(({ v, label }) => (
                    <button key={v} onClick={() => setRecurrence(v as any)}
                      style={{ padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, border: `1.5px solid ${recurrence === v ? '#7c3aed' : 'var(--border)'}`, background: recurrence === v ? '#f5f3ff' : 'var(--bg-card)', color: recurrence === v ? '#7c3aed' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.1s' }}>
                      {label}
                    </button>
                  ))}
                </div>
                {recurrence !== 'none' && (
                  <p style={{ fontSize: '11px', color: '#7c3aed', marginTop: '6px' }}>
                    {t('campaigns.recurrenceDesc')} {recurrence === 'daily' ? t('campaigns.nextDay') : recurrence === 'weekly' ? t('campaigns.nextWeek') : t('campaigns.nextMonth')}.
                    {contactMode === 'segment' ? ` ${t('campaigns.contactsReloadedBySegment')}` : ` ${t('campaigns.useSegmentToReload')}`}
                  </p>
                )}
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--divider)', display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button onClick={() => { setShowModal(false); resetModal() }} style={{ flex: 1, padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13.5px', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 500 }}>
                {t('common.cancel')}
              </button>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !isValid}
                style={{ flex: 1, padding: '10px', background: !isValid || createMutation.isPending ? 'var(--text-faintest)' : scheduleMode === 'scheduled' ? '#7c3aed' : '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13.5px', fontWeight: 600, cursor: !isValid || createMutation.isPending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.12s' }}>
                {createMutation.isPending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : scheduleMode === 'scheduled' ? <Calendar size={14} /> : <Send size={14} />}
                {scheduleMode === 'scheduled' ? t('campaigns.schedule') : t('campaigns.createAndSend')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { border-color: #22c55e !important; box-shadow: 0 0 0 3px rgba(34,197,94,0.1) !important; outline: none; }
      `}</style>
    </div>
  )
}
