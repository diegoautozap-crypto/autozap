'use client'

import { create } from 'zustand'
import { useAuthStore } from './auth.store'
import { authApi } from '@/lib/api'

interface Permissions {
  role: string
  isAdmin: boolean
  allowedPages: string[]
  editablePages: string[]
  campaignAccess: 'none' | 'view' | 'create' | 'manage'
  conversationAccess: 'assigned' | 'all'
  allowedChannels: string[]
  loaded: boolean
}

interface PermissionsStore extends Permissions {
  load: () => Promise<void>
  canEdit: (page?: string) => boolean
  canDelete: (page?: string) => boolean
  canEditPage: (page: string) => boolean
  canManageCampaigns: () => boolean
  canCreateCampaigns: () => boolean
  canViewCampaigns: () => boolean
}

export const usePermissionsStore = create<PermissionsStore>((set, get) => ({
  role: 'agent',
  isAdmin: false,
  allowedPages: [],
  editablePages: [],
  campaignAccess: 'none',
  conversationAccess: 'assigned',
  allowedChannels: [],
  loaded: false,

  load: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    const role = (user as any)?.role || 'agent'
    const isAdmin = role === 'admin' || role === 'owner'

    if (isAdmin) {
      set({
        role, isAdmin, loaded: true,
        allowedPages: [],
        editablePages: [],
        campaignAccess: 'manage',
        conversationAccess: 'all',
        allowedChannels: [],
      })
      return
    }

    try {
      const res = await authApi.get('/auth/me')
      if (!res.data?.data) return
      const perms = res.data.data.permissions || {}

      set({
        role,
        isAdmin: false,
        loaded: true,
        allowedPages: perms.allowed_pages || [],
        editablePages: perms.editable_pages || [],
        campaignAccess: perms.campaign_access || 'none',
        conversationAccess: perms.conversation_access || 'assigned',
        allowedChannels: perms.allowed_channels || [],
      })
    } catch {
      set({ role, isAdmin: false, loaded: true })
    }
  },

  canEdit: (page?: string) => {
    const { isAdmin, editablePages } = get()
    if (isAdmin) return true
    if (!page) return editablePages.length > 0
    return editablePages.some(p => page === p || page.startsWith(p + '/'))
  },

  canDelete: (page?: string) => {
    const { isAdmin, editablePages } = get()
    if (isAdmin) return true
    if (!page) return editablePages.length > 0
    return editablePages.some(p => page === p || page.startsWith(p + '/'))
  },

  canEditPage: (page: string) => {
    const { isAdmin, editablePages } = get()
    if (isAdmin) return true
    return editablePages.some(p => page === p || page.startsWith(p + '/'))
  },

  canManageCampaigns: () => {
    const { isAdmin, campaignAccess } = get()
    return isAdmin || campaignAccess === 'manage'
  },

  canCreateCampaigns: () => {
    const { isAdmin, campaignAccess } = get()
    return isAdmin || campaignAccess === 'manage' || campaignAccess === 'create'
  },

  canViewCampaigns: () => {
    const { isAdmin, campaignAccess } = get()
    return isAdmin || campaignAccess !== 'none'
  },
}))

export function usePermissions() {
  return usePermissionsStore()
}
