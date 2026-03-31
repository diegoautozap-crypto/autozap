'use client'

import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err: Error) { console.error('ErrorBoundary caught:', err) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fafafa', fontFamily: 'DM Sans, sans-serif' }}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ fontSize: '48px', marginBottom: '8px' }}>:(</p>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#18181b', marginBottom: '8px' }}>Algo deu errado</h2>
            <p style={{ fontSize: '14px', color: '#71717a', marginBottom: '20px' }}>Ocorreu um erro inesperado. Tente recarregar a página.</p>
            <button onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
              style={{ padding: '10px 24px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
              Recarregar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
