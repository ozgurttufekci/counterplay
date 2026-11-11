import { afterEach, describe, expect, it, vi } from 'vitest'
import { PuzzleService } from '../src/features/puzzles/client'
import type { WorkerRequest, WorkerResponse } from '../src/features/puzzles/protocol'
import type { Puzzle } from '../src/chess/types'

class FakeWorker {
  static instances: FakeWorker[] = []
  requests: WorkerRequest[] = []
  terminated = false
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  constructor() { FakeWorker.instances.push(this) }
  postMessage(request: WorkerRequest) { this.requests.push(request) }
  terminate() { this.terminated = true }
  emit(message: WorkerResponse) { this.onmessage?.(new MessageEvent('message', { data: message })) }
}

const puzzle: Puzzle = {
  id: 'queue-fixture', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
  position: { moves: [] }, seed: 1, color: 'w', theme: 'mate', difficulty: 'gentle',
  objective: { theme: 'mate', solver: 'w', plies: 1, baseline: 5, target: 0 },
  solution: ['d1d8'], firstMove: 'd1d8', rootMoves: 20, engine: 'test fixture',
  generatedAt: new Date(0).toISOString(),
  verification: { nodes: 1, engineNodes: 1, candidates: 1, elapsedMs: 1, version: 1 },
}
const request = { color: 'w', theme: 'mate', difficulty: 'gentle', seed: 1, excluded: [] } as const
const services: PuzzleService[] = []

function setup() {
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('location', { href: 'http://localhost/counterplay/' })
  const service = new PuzzleService()
  services.push(service)
  return service
}

function worker(index: number) {
  const instance = FakeWorker.instances[index]
  if (!instance) throw new Error('Expected a worker to have started')
  return instance
}

afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  FakeWorker.instances = []
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('browser worker scheduling', () => {
  it('cancels only a queued request, leaving the running engine usable', async () => {
    const service = setup()
    const first = service.generate({ ...request, excluded: [] }, new AbortController().signal, () => {})
    const queued = new AbortController()
    const second = service.generate({ ...request, excluded: [] }, queued.signal, () => {})
    const rejected = expect(second).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker(0).requests).toHaveLength(1)
    queued.abort()
    await rejected
    expect(worker(0).terminated).toBe(false)
    worker(0).emit({ id: 1, type: 'generated', puzzle })
    expect(await first).toBe(puzzle)
  })

  it('ignores late messages and errors from a terminated worker after cancellation', async () => {
    const service = setup()
    const active = new AbortController()
    const first = service.generate({ ...request, excluded: [] }, active.signal, () => {})
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    const second = service.generate({ ...request, excluded: [] }, new AbortController().signal, () => {})
    active.abort()
    await rejected
    expect(worker(0).terminated).toBe(true)
    worker(0).emit({ id: 2, type: 'generated', puzzle: { ...puzzle, id: 'stale' } })
    worker(0).onerror?.({ message: 'Stale load failure' })
    worker(1).emit({ id: 2, type: 'generated', puzzle })
    expect((await second).id).toBe(puzzle.id)
  })

  it('does not queue grading behind a long-running generation request', async () => {
    const service = setup()
    const pending = new AbortController()
    const generation = service.generate({ ...request, excluded: [] }, pending.signal, () => {})
    const rejected = expect(generation).rejects.toMatchObject({ name: 'AbortError' })
    const grading = service.grade(puzzle, [], 'd1d8', new AbortController().signal)
    expect(FakeWorker.instances).toHaveLength(2)
    worker(1).emit({ id: 1, type: 'graded', grade: { accepted: true, complete: true, moves: ['d1d8'], continuation: [], message: 'Complete' } })
    expect((await grading).complete).toBe(true)
    expect(worker(0).terminated).toBe(false)
    pending.abort()
    await rejected
  })

  it('terminates an unresponsive worker and explicitly rejects the request', async () => {
    vi.useFakeTimers()
    const service = setup()
    const generation = service.generate({ ...request, excluded: [] }, new AbortController().signal, () => {})
    const rejected = expect(generation).rejects.toThrow('time limit')
    await vi.advanceTimersByTimeAsync(155_000)
    await rejected
    expect(worker(0).terminated).toBe(true)
  })
})
