import { Component } from 'react'

// Without this, any render-time throw white-screens the whole app. Catch it and
// show a recoverable message instead.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[DemoTrack] render error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-dvh place-items-center px-6 text-center">
          <div className="max-w-sm">
            <h1 className="font-display text-xl font-bold">Something broke</h1>
            <p className="mt-2 text-sm text-muted">
              An unexpected error occurred. Reloading usually fixes it.
            </p>
            <button
              onClick={() => window.location.assign('/')}
              className="mt-4 rounded-lg bg-accent px-4 py-2 font-semibold text-ink"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
