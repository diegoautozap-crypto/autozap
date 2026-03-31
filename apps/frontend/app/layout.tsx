import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/providers'
import { ErrorBoundary } from '@/components/error-boundary'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'AutoZap',
  description: 'Plataforma profissional de WhatsApp & CRM',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ErrorBoundary>
          <Providers>
            {children}
            <Toaster richColors position="top-right" theme="system" />
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  )
}
