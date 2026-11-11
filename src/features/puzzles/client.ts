import type { Puzzle } from '../../chess/types'
import type { GenerateRequest, Progress } from './generate'
import type { Grade } from './solve'
import type { WorkerRequest, WorkerResponse } from './protocol'

type RequestData = WorkerRequest extends infer Request
  ? Request extends WorkerRequest ? Omit<Request, 'id'> : never : never
type Result = Extract<WorkerResponse, { type: 'generated' | 'graded' }>

interface Job {
  id: number
  request: WorkerRequest
  resolve: (result: Result) => void
  reject: (error: Error) => void
  progress?: (progress: Progress) => void
  cleanup: () => void
}

class WorkerQueue {
  private worker: Worker | null = null
  private queue: Job[] = []
  private active: Job | null = null
  private sequence = 0
  private timer: ReturnType<typeof setTimeout> | null = null

  submit(request: RequestData, signal: AbortSignal, progress?: Job['progress']): Promise<Result> {
    if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'))
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      const abort = () => {
        const error = new DOMException('Cancelled', 'AbortError')
        if (this.active?.id === id) {
          this.stopWorker()
          this.finish(error)
        } else {
          const index = this.queue.findIndex((job) => job.id === id)
          const [job] = this.queue.splice(index, index >= 0 ? 1 : 0)
          job?.cleanup()
          job?.reject(error)
        }
      }
      signal.addEventListener('abort', abort, { once: true })
      this.queue.push({
        id, request: { ...request, id }, resolve, reject, progress,
        cleanup: () => signal.removeEventListener('abort', abort),
      })
      if (this.active) progress?.({
        stage: 'loading', message: 'Queued behind the other puzzle. Each search gets the full engine.', candidates: 0, games: 0,
      })
      this.start()
    })
  }

  private start() {
    if (this.active) return
    const job = this.queue.shift()
    if (!job) return
    this.active = job
    try {
      this.worker ??= new Worker(new URL('./puzzle.worker.ts', import.meta.url), { type: 'module' })
      const worker = this.worker
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (this.worker !== worker) return
        if (data.id !== this.active?.id) return
        if (data.type === 'progress') this.active.progress?.(data.progress)
        else if (data.type === 'error') this.finish(new Error(data.message))
        else this.finish(null, data)
      }
      worker.onerror = (event) => {
        if (this.worker !== worker) return
        this.stopWorker()
        this.finish(new Error(event.message || 'A chess worker failed to load. Check browser WebAssembly support and retry.'))
      }
      this.timer = setTimeout(() => {
        this.stopWorker()
        this.finish(new Error('The puzzle worker exceeded its time limit. Nothing unverified was accepted; please retry.'))
      }, job.request.type === 'generate' ? 155_000 : 60_000)
      worker.postMessage(job.request)
    } catch (error) {
      this.stopWorker()
      this.finish(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private stopWorker() {
    this.worker?.terminate()
    this.worker = null
  }

  private finish(error: Error | null, result?: Result) {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const job = this.active
    this.active = null
    job?.cleanup()
    if (error) job?.reject(error)
    else if (result) job?.resolve(result)
    this.start()
  }

  dispose() {
    const jobs = this.queue.splice(0)
    if (this.active) jobs.push(this.active)
    this.active = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.stopWorker()
    for (const job of jobs) {
      job.cleanup()
      job.reject(new DOMException('Cancelled', 'AbortError'))
    }
  }
}

export class PuzzleService {
  private readonly generation = new WorkerQueue()
  private readonly verification = new WorkerQueue()

  async generate(request: GenerateRequest, signal: AbortSignal, progress: (progress: Progress) => void): Promise<Puzzle> {
    const engineUrl = new URL(`${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`, location.href).href
    const result = await this.generation.submit({ type: 'generate', request, engineUrl }, signal, progress)
    if (result.type !== 'generated') throw new Error('Unexpected response from the puzzle generator.')
    return result.puzzle
  }

  async grade(puzzle: Puzzle, played: string[], move: string, signal: AbortSignal): Promise<Grade> {
    const result = await this.verification.submit({ type: 'grade', puzzle, played, move }, signal)
    if (result.type !== 'graded') throw new Error('Unexpected response from the puzzle verifier.')
    return result.grade
  }

  dispose() {
    this.generation.dispose()
    this.verification.dispose()
  }
}
