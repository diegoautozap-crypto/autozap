import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ptBR } from './pt-BR'
import { en } from './en'
import { es } from './es'

const translations: Record<string, Record<string, string>> = {
  'pt-BR': ptBR,
  'en': en,
  'es': es,
}

type Locale = 'pt-BR' | 'en' | 'es'

interface I18nStore {
  locale: Locale
  setLocale: (l: Locale) => void
}

export const useI18nStore = create<I18nStore>()(
  persist(
    (set) => ({
      locale: 'pt-BR',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'autozap-locale' }
  )
)

export function useT() {
  const { locale } = useI18nStore()
  return (key: string): string => {
    return translations[locale]?.[key] || translations['pt-BR']?.[key] || key
  }
}

export const LOCALES = [
  { code: 'pt-BR' as Locale, label: 'Português' },
  { code: 'en' as Locale, label: 'English' },
  { code: 'es' as Locale, label: 'Español' },
]
