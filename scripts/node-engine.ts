import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import type { Transport } from '../src/engine/uci'
import { UciEngine } from '../src/engine/uci'

class NodeTransport implements Transport {
  private readonly process = spawn(process.execPath, [
    fileURLToPath(new URL('../node_modules/stockfish/bin/stockfish-19-lite-single.js', import.meta.url)),
  ], { stdio: ['pipe', 'pipe', 'pipe'] })

  send(command: string) {
    this.process.stdin.write(`${command}\n`)
  }

  listen(onLine: (line: string) => void, onError: (error: Error) => void) {
    const lines = createInterface({ input: this.process.stdout })
    let stderr = ''
    lines.on('line', onLine)
    this.process.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
    this.process.on('error', onError)
    const exit = (code: number | null) => {
      if (code !== 0) onError(new Error(`Stockfish exited (${code}): ${stderr}`))
    }
    this.process.on('exit', exit)
    return () => {
      lines.close()
      this.process.removeListener('error', onError)
      this.process.removeListener('exit', exit)
    }
  }

  dispose() {
    this.process.kill()
  }
}

export function createNodeEngine() {
  return new UciEngine(new NodeTransport())
}
