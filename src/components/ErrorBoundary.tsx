import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-8 max-w-lg w-full">
            <div className="text-3xl mb-3">⚠️</div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-600 mb-4">
              The app hit an error. The details below may help.
            </p>
            <pre className="text-xs bg-slate-100 text-slate-800 rounded-lg p-3 overflow-x-auto">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 px-4 py-2 rounded-lg bg-crrem-navy text-white text-sm font-medium"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
