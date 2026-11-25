import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch() {
    // Keep internal error details out of end-user UI
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary-page">
          <section className="dashboard-panel error-boundary-card" role="alert">
            <span className="error-boundary-icon" aria-hidden="true">
              <AlertTriangle size={24} />
            </span>
            <p className="eyebrow">Something went wrong</p>
            <h1>We hit an unexpected display error.</h1>
            <p className="field-note">
              Your data is safe. Try reloading this page or returning to your dashboard.
            </p>
            <div className="inline-actions" style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="button"
                onClick={() => window.location.reload()}
              >
                <RotateCcw size={15} /> Reload page
              </button>
              <a className="button button-outline" href="/dashboard">
                Back to dashboard
              </a>
            </div>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
