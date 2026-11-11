import { describe, expect, it } from 'vitest'
import { parseInfo, scoreFor, UciEngine } from '../src/engine/uci'
import type { Transport } from '../src/engine/uci'
import { createNodeEngine } from '../scripts/node-engine'

class FakeTransport implements Transport {
  commands: string[] = []
  disposed = false
  onLine: (line: string) => void = () => {}
  onError: (error: Error) => void = () => {}
  send(command: string) {
    this.commands.push(command)
    if (command === 'uci') queueMicrotask(() => this.onLine('uciok'))
    if (command === 'isready') queueMicrotask(() => this.onLine('readyok'))
  }
  listen(line: (line: string) => void, error: (error: Error) => void) {
    this.onLine = line
    this.onError = error
    return () => { this.onLine = () => {} }
  }
  dispose() { this.disposed = true }
}

describe('typed UCI protocol', () => {
  it('parses PVs, mate scores, ranks, and bounds without conflating them', () => {
    expect(parseInfo('info depth 12 multipv 2 score mate -3 upperbound nodes 456 pv e2e4 e7e5'))
      .toEqual({ depth: 12, rank: 2, nodes: 456, score: { kind: 'mate', value: -3, bound: 'upper' }, moves: ['e2e4', 'e7e5'] })
    expect(parseInfo('info string NNUE evaluation')).toBeNull()
    expect(parseInfo('info depth 5 score cp 80 nodes 100 pv g1f3')?.score.kind).toBe('cp')
  })

  it('flips score perspective and reverses bounds together', () => {
    expect(scoreFor({ kind: 'cp', value: 120, bound: 'lower' }, 'b', 'w'))
      .toEqual({ kind: 'cp', value: -120, bound: 'upper' })
    expect(scoreFor({ kind: 'mate', value: -2, bound: 'exact' }, 'b', 'w').value).toBe(2)
  })

  it('serializes queued searches and waits for bestmove before sending another position', async () => {
    const transport = new FakeTransport()
    const engine = new UciEngine(transport)
    const first = engine.analyze({ moves: [] }, { nodes: 100 })
    const second = engine.analyze({ moves: ['e2e4'] }, { nodes: 100 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(transport.commands.filter((command) => command.startsWith('position'))).toHaveLength(1)
    transport.onLine('info depth 2 score cp 12 nodes 100 pv e2e4')
    transport.onLine('bestmove e2e4')
    expect((await first).bestMove).toBe('e2e4')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(transport.commands.filter((command) => command.startsWith('position'))).toHaveLength(2)
    transport.onLine('info depth 2 score cp 10 nodes 100 pv e7e5')
    transport.onLine('bestmove e7e5')
    expect((await second).bestMove).toBe('e7e5')
    engine.dispose()
  })

  it('terminates on cancellation and cannot reuse stale output', async () => {
    const transport = new FakeTransport()
    const engine = new UciEngine(transport)
    const first = engine.analyze({ moves: [] }, { nodes: 100 })
    const rejected = expect(first).rejects.toThrow('cancelled')
    await new Promise((resolve) => setTimeout(resolve, 0))
    engine.dispose()
    transport.onLine('bestmove e2e4')
    await rejected
    await expect(engine.analyze({ moves: [] }, { nodes: 100 })).rejects.toThrow('cancelled')
    expect(transport.disposed).toBe(true)
  })

  it('surfaces worker initialization errors', async () => {
    const transport = new FakeTransport()
    const engine = new UciEngine(transport)
    const search = engine.analyze({ moves: [] }, { nodes: 100 })
    const rejected = expect(search).rejects.toThrow('Missing WASM')
    transport.onError(new Error('Missing WASM'))
    await rejected
    engine.dispose()
  })

  it('performs a real lite-WASM search, including a restricted root move', async () => {
    const engine = createNodeEngine()
    try {
      const result = await engine.analyze({ moves: [] }, { nodes: 1000, searchMoves: ['e2e4'] })
      expect(result.bestMove).toBe('e2e4')
      expect(result.nodes).toBeGreaterThan(0)
      expect(result.lines[0]?.score.bound).toBe('exact')
    } finally {
      engine.dispose()
    }
  })
})
