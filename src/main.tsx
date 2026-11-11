import { Component, StrictMode } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error: error.message } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Counterplay could not render the workspace.', error, info) }
  render() {
    return this.state.error
      ? <main className="fatal-error" role="alert"><h1>The chess workspace could not load.</h1><p>{this.state.error}</p><p>No position or result should be treated as verified. Reload to try again.</p><button className="button primary" onClick={() => location.reload()}>Reload app</button></main>
      : this.props.children
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('The application root element is missing.')
createRoot(root).render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>)
