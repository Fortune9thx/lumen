import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Lumen crashed:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-bg-void text-text-primary flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <h1 className="font-serif font-light text-3xl mb-4">Something went wrong</h1>
            <p className="text-text-secondary text-sm mb-8">
              Lumen hit an unexpected error. Reloading usually fixes it — if it keeps happening, the error has been
              logged to the console for debugging.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="h-12 px-7 rounded-full bg-accent-blue text-white text-[15px] font-medium hover:brightness-110 transition-all"
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
