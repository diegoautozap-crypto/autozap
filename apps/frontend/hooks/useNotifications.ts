'use client'

import { useEffect, useRef, useCallback } from 'react'
import Pusher from 'pusher-js'
import { useAuthStore } from '@/store/auth.store'

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

let unreadCount = 0
let originalTitle = ''

function incrementBadge() {
  if (!originalTitle) originalTitle = document.title.replace(/^\(\d+\)\s*/, '')
  unreadCount++
  document.title = `(${unreadCount}) ${originalTitle}`
}

function clearBadge() {
  unreadCount = 0
  if (originalTitle) document.title = originalTitle
}

function isViewingInbox(): boolean {
  return document.hasFocus() && window.location.pathname.includes('/inbox')
}

export function useNotifications() {
  const { user } = useAuthStore()
  const tenantId = (user as any)?.tenantId || (user as any)?.tid
  const pusherRef = useRef<Pusher | null>(null)
  const swRegistered = useRef(false)

  const registerSW = useCallback(async () => {
    if (swRegistered.current || typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      swRegistered.current = true
      console.log('[Notifications] Service worker registrado')
    } catch (err) {
      console.warn('[Notifications] SW registration failed:', err)
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    console.log('[Notifications] Permissão:', Notification.permission)
  }, [])

  const showNotification = useCallback((title: string, body: string, url = '/dashboard/inbox') => {
    if (typeof window === 'undefined') return
    console.log('[Notifications] Disparando notificação:', { title, body })
    playNotificationSound()
    incrementBadge()
    if (Notification.permission === 'granted' && !document.hasFocus()) {
      const options: any = { body, icon: '/icon-192.png', tag: 'autozap-message', renotify: true }
      const n = new Notification(title, options)
      n.onclick = () => { window.focus(); window.location.href = url; n.close() }
    }
  }, [])

  useEffect(() => {
    const handleFocus = () => clearBadge()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  useEffect(() => {
    registerSW()
    requestPermission()
  }, [registerSW, requestPermission])

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'sa1'

    console.log('[Notifications] tenantId:', tenantId)
    console.log('[Notifications] Pusher key existe:', !!key)

    if (!key || !tenantId) {
      console.warn('[Notifications] Abortando — key ou tenantId ausente')
      return
    }

    const pusher = new Pusher(key, { cluster })
    pusherRef.current = pusher

    const channelName = `tenant-${tenantId}`
    console.log('[Notifications] Inscrevendo no canal:', channelName)
    const channel = pusher.subscribe(channelName)

    channel.bind('pusher:subscription_succeeded', () => {
      console.log('[Notifications] ✅ Inscrito com sucesso no canal:', channelName)
    })

    channel.bind('pusher:subscription_error', (err: any) => {
      console.error('[Notifications] ❌ Erro ao inscrever no canal:', err)
    })

    channel.bind('inbound.message', (data: any) => {
      console.log('[Notifications] 🔔 inbound.message recebido:', data)
      if (isViewingInbox()) {
        console.log('[Notifications] Ignorando — usuário está no inbox com foco')
        return
      }
      const contactName = data?.contactName || data?.phone || 'Contato'
      const preview = data?.body
        ? data.body.slice(0, 60) + (data.body.length > 60 ? '...' : '')
        : 'Nova mensagem'
      showNotification(`💬 ${contactName}`, preview, '/dashboard/inbox')
    })

    return () => {
      channel.unbind_all()
      pusher.unsubscribe(channelName)
      pusher.disconnect()
      pusherRef.current = null
    }
  }, [tenantId, showNotification])

  return { requestPermission, clearBadge }
}