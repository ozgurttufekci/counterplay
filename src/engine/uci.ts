import type { Color } from 'chess.js'
import type { GamePosition } from '../chess/types'

export type EngineScore = {
  kind: 'cp' | 'mate'
  value: number
  bound: 'exact' | 'lower' | 'upper'
}

export interface EngineLine {
  depth: number
  rank: number
  nodes: number
  score: EngineScore
  moves: string[]
}

export interface Analysis {
  bestMove: string
  lines: EngineLine[]
  nodes: number
}

export interface SearchOptions {
  nodes: number
  multiPv?: number
  searchMoves?: string[]
}

export interface Transport {
  send(command: string): void
  listen(onLine: (line: string) => void, onError: (error: Error) => void): () => void
  dispose(): void
}

export interface Analyzer {
  analyze(position: GamePosition, options: SearchOptions): Promise<Analysis>
}

export function parseInfo(line: string): EngineLine | null {
  if (!line.startsWith('info ')) return null
  const score = /\bscore (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?/.exec(line)
  const pv = /\bpv (.+)$/.exec(line)
  if (!score || !pv || !pv[1]) return null
  const kind = score[1] === 'mate' ? 'mate' : 'cp'
  return {
    depth: Number(/\bdepth (\d+)/.exec(line)?.[1] ?? 0),
    rank: Number(/\bmultipv (\d+)/.exec(line)?.[1] ?? 1),
    nodes: Number(/\bnodes (\d+)/.exec(line)?.[1] ?? 0),
    score: {
      kind,
      value: Number(score[2]),
      bound: score[3] === 'lowerbound' ? 'lower' : score[3] === 'upperbound' ? 'upper' : 'exact',
    },
    moves: pv[1].trim().split(/\s+/),
  }
}

export function scoreFor(score: EngineScore, turn: Color, color: Color): EngineScore {
  if (turn === color) return score
  return {
    ...score,
    value: -score.value,
    bound: score.bound === 'lower' ? 'upper' : score.bound === 'upper' ? 'lower' : 'exact',
  }
}

export class UciEngine implements Analyzer {
  private queue: Promise<unknown> = Promise.resolve()
  private ready: Promise<void> | null = null
  private failure: Error | null = null
  private activeFailure: ((error: Error) => void) | null = null
  private readonly unsubscribe: () => void
  private handlers = new Set<(line: string) => void>()

  constructor(private readonly transport: Transport, private readonly timeoutMs = 30_000) {
    this.unsubscribe = transport.listen(
      (line) => this.handlers.forEach((handler) => handler(line)),
      (error) => this.fail(error),
    )
  }

  private fail(error: Error) {
    this.failure = error
    this.activeFailure?.(error)
    this.transport.dispose()
  }

  private collect<T>(command: string, collect: (line: string) => { value: T } | null): Promise<T> {
    if (this.failure) return Promise.reject(this.failure)
    return new Promise<T>((resolve, reject) => {
      const finish = () => {
        clearTimeout(timer)
        this.handlers.delete(handler)
        this.activeFailure = null
      }
      const onFailure = (error: Error) => {
        finish()
        reject(error)
      }
      const timer = setTimeout(() => this.fail(new Error('The chess engine timed out. Please retry.')), this.timeoutMs)
      const handler = (line: string) => {
        const result = collect(line)
        if (result) {
          finish()
          resolve(result.value)
        }
      }
      this.activeFailure = onFailure
      this.handlers.add(handler)
      try {
        this.transport.send(command)
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private initialize(): Promise<void> {
    this.ready ??= (async () => {
      await this.collect('uci', (line) => line === 'uciok' ? { value: undefined } : null)
      this.transport.send('setoption name Threads value 1')
      this.transport.send('setoption name Hash value 16')
      await this.collect('isready', (line) => line === 'readyok' ? { value: undefined } : null)
    })()
    return this.ready
  }

  analyze(position: GamePosition, options: SearchOptions): Promise<Analysis> {
    const run = async (): Promise<Analysis> => {
      await this.initialize()
      if (this.failure) throw this.failure
      if (!Number.isInteger(options.nodes) || options.nodes < 1) throw new Error('Engine node budget must be a positive integer.')
      this.transport.send(`setoption name MultiPV value ${options.multiPv ?? 1}`)
      this.transport.send('ucinewgame')
      await this.collect('isready', (line) => line === 'readyok' ? { value: undefined } : null)
      const start = position.initialFen ? `fen ${position.initialFen}` : 'startpos'
      this.transport.send(`position ${start}${position.moves.length ? ` moves ${position.moves.join(' ')}` : ''}`)
      const lines = new Map<number, EngineLine>()
      let nodes = 0
      const moves = options.searchMoves?.length ? ` searchmoves ${options.searchMoves.join(' ')}` : ''
      return this.collect(`go nodes ${options.nodes}${moves}`, (line) => {
        const info = parseInfo(line)
        if (info) {
          nodes = Math.max(nodes, info.nodes)
          if (info.score.bound === 'exact') lines.set(info.rank, info)
        }
        if (!line.startsWith('bestmove ')) return null
        const bestMove = line.split(/\s+/)[1]
        if (!bestMove || bestMove === '(none)' || bestMove === '0000') {
          this.fail(new Error('The engine returned no legal move.'))
          return null
        }
        return { value: { bestMove, nodes, lines: [...lines.values()].sort((a, b) => a.rank - b.rank) } }
      })
    }
    const result = this.queue.then(run)
    this.queue = result.catch(() => undefined)
    return result
  }

  dispose() {
    this.fail(new Error('Chess analysis was cancelled.'))
    this.unsubscribe()
    this.handlers.clear()
  }
}
