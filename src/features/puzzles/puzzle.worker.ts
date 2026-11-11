import { BrowserTransport } from '../../engine/browser'
import { UciEngine } from '../../engine/uci'
import { generatePuzzle } from './generate'
import { gradeMove } from './solve'
import type { WorkerRequest, WorkerResponse } from './protocol'

let engine: UciEngine | null = null
const send = (message: WorkerResponse) => self.postMessage(message)

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    if (data.type === 'grade') {
      send({ id: data.id, type: 'graded', grade: gradeMove(data.puzzle, data.played, data.move) })
      return
    }
    if (!engine) {
      send({ id: data.id, type: 'progress', progress: {
        stage: 'loading', message: 'Loading the local chess engine. The first visit takes a moment.', candidates: 0, games: 0,
      } })
      engine = new UciEngine(new BrowserTransport(data.engineUrl))
      await engine.analyze({ moves: [] }, { nodes: 100 })
    }
    const puzzle = await generatePuzzle(engine, data.request, (progress) => send({ id: data.id, type: 'progress', progress }))
    send({ id: data.id, type: 'generated', puzzle })
  } catch (error) {
    engine?.dispose()
    engine = null
    send({ id: data.id, type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
