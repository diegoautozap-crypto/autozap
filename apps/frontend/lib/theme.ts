import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

interface ThemeStore {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'light',
      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme)
      },
      toggle: () => {
        const next = get().theme === 'light' ? 'dark' : 'light'
        set({ theme: next })
        applyTheme(next)
      },
    }),
    { name: 'autozap-theme' }
  )
)

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

// Aplica tema ao carregar
if (typeof window !== 'undefined') {
  const stored = JSON.parse(localStorage.getItem('autozap-theme') || '{}')
  const theme = stored?.state?.theme || 'light'
  applyTheme(theme)
}
