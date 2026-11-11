import type { Puzzle } from '../../chess/types'
import type { GenerateRequest, Progress } from './generate'
import type { Grade } from './solve'

export type WorkerRequest =
  | { id: number; type: 'generate'; request: GenerateRequest; engineUrl: string }
  | { id: number; type: 'grade'; puzzle: Puzzle; played: string[]; move: string }

export type WorkerResponse =
  | { id: number; type: 'progress'; progress: Progress }
  | { id: number; type: 'generated'; puzzle: Puzzle }
  | { id: number; type: 'graded'; grade: Grade }
  | { id: number; type: 'error'; message: string }
