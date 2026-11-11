import type { Transport } from './uci'

export class BrowserTransport implements Transport {
  private readonly worker: Worker

  constructor(url: string) {
    this.worker = new Worker(url)
  }

  send(command: string) {
    this.worker.postMessage(command)
  }

  listen(onLine: (line: string) => void, onError: (error: Error) => void) {
    const message = (event: MessageEvent<unknown>) => {
      if (typeof event.data === 'string') {
        for (const line of event.data.split('\n')) onLine(line.trim())
      }
    }
    const error = (event: ErrorEvent) => onError(new Error(event.message || 'Unable to load the Stockfish worker or WebAssembly file.'))
    this.worker.addEventListener('message', message)
    this.worker.addEventListener('error', error)
    return () => {
      this.worker.removeEventListener('message', message)
      this.worker.removeEventListener('error', error)
    }
  }

  dispose() {
    this.worker.terminate()
  }
}
