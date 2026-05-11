import { Component, type ReactNode } from 'react'
import { MainLayout } from './components/Layout/MainLayout'
import { ConsultationPage } from './pages/ConsultationPage'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-red-400 bg-slate-950 min-h-screen">
          <p className="font-bold text-lg mb-2">렌더링 에러</p>
          <pre className="text-xs whitespace-pre-wrap bg-slate-900 p-4 rounded">
            {(this.state.error as Error).message}
            {'\n\n'}
            {(this.state.error as Error).stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainLayout>
        <ConsultationPage />
      </MainLayout>
    </ErrorBoundary>
  )
}
