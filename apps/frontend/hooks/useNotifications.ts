'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { useUnreadStore } from '@/store/unread.store'
import { subscribeTenant } from '@/lib/pusher'
import { conversationApi } from '@/lib/api'

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  } catch {}
}

const ORIGINAL_TITLE = 'AutoZap'

function updateDocumentTitle(count: number) {
  document.title = count > 0 ? `(${count}) AutoZap` : ORIGINAL_TITLE
}

async function fetchTotalUnread(): Promise<number> {
  try {
    const { data } = await conversationApi.get('/conversations?status=open&limit=100')
    const convs = data?.data || []
    return convs.filter((c: any) => c.unread_count > 0).length
  } catch {
    return 0
  }
}

export function useNotifications() {
  const { user } = useAuthStore()
  const tenantId = (user as any)?.tenantId || (user as any)?.tid
  const swRegistered = useRef(false)
  const { totalUnread, setTotalUnread, increment } = useUnreadStore()

  // Sync document title with unread count
  useEffect(() => {
    updateDocumentTitle(totalUnread)
  }, [totalUnread])

  // Fetch real unread count on mount and periodically
  useEffect(() => {
    let mounted = true
    const sync = async () => {
      const count = await fetchTotalUnread()
      if (mounted) setTotalUnread(count)
    }
    sync()
    const interval = setInterval(sync, 30_000)
    return () => { mounted = false; clearInterval(interval) }
  }, [setTotalUnread])

  // Clear badge on window focus
  useEffect(() => {
    const handleFocus = () => {
      // Re-fetch actual count when user returns
      fetchTotalUnread().then(setTotalUnread)
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [setTotalUnread])

  const registerSW = useCallback(async () => {
    if (swRegistered.current || typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      swRegistered.current = true
    } catch (err) {
      console.warn('SW registration failed:', err)
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  }, [])

  const showNotification = useCallback((title: string, body: string, url = '/dashboard/inbox') => {
    if (typeof window === 'undefined') return

    playNotificationSound()
    increment()

    if (Notification.permission !== 'granted') return

    const n = new Notification(title, { body })
    n.onclick = () => {
      window.focus()
      window.location.href = url
      n.close()
    }
  }, [increment])

  useEffect(() => {
    registerSW()
    requestPermission()
  }, [registerSW, requestPermission])

  useEffect(() => {
    if (!tenantId) return

    const channel = subscribeTenant(tenantId)
    if (!channel) return

    const handler = (data: any) => {
      const contactName = data?.contactName || data?.phone || 'Contato'
      const preview = data?.body
        ? data.body.slice(0, 60) + (data.body.length > 60 ? '...' : '')
        : 'Nova mensagem'
      showNotification(`\u{1F4AC} ${contactName}`, preview, '/dashboard/inbox')
    }

    channel.bind('inbound.message', handler)
    return () => { channel.unbind('inbound.message', handler) }
  }, [tenantId, showNotification])

  return { requestPermission }
}
