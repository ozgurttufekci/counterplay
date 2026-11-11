import { z } from 'zod'
import { Chess, validateFen } from 'chess.js'
import { fromPosition, material } from './chess/rules'
import type { Puzzle } from './chess/types'

export const STORAGE_KEY = 'counterplay:v1'
const color = z.enum(['w', 'b'])
const theme = z.enum(['mate', 'defend', 'material'])
const difficulty = z.enum(['gentle', 'balanced', 'deep'])
const move = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)
const fen = z.string().max(100).refine((value) => validateFen(value).ok)
const puzzleSchema: z.ZodType<Puzzle> = z.object({
  id: z.string().min(1).max(80),
  fen,
  position: z.object({ initialFen: fen.optional(), moves: z.array(move).min(22).max(69) }),
  seed: z.number().int().min(0).max(4294967295),
  color,
  theme,
  difficulty,
  objective: z.object({
    theme, solver: color, plies: z.number().int().min(1).max(4),
    target: z.number().int().min(0).max(9), baseline: z.number().int().min(-100).max(100),
  }),
  solution: z.array(move).min(1).max(4),
  firstMove: move,
  rootMoves: z.number().int().min(2).max(218),
  engine: z.literal('Stockfish.js 19 lite single-threaded'),
  generatedAt: z.iso.datetime(),
  verification: z.object({
    nodes: z.number().int().nonnegative(), engineNodes: z.number().int().positive(),
    candidates: z.number().int().positive(), elapsedMs: z.number().int().nonnegative(), version: z.literal(1),
  }),
}).superRefine((puzzle, ctx) => {
  try {
    const board = fromPosition(puzzle.position)
    const valid = !puzzle.position.initialFen && board.fen() === puzzle.fen && board.turn() === puzzle.color
      && puzzle.objective.solver === puzzle.color && puzzle.objective.theme === puzzle.theme
      && puzzle.objective.baseline === material(board, puzzle.color)
      && (puzzle.theme === 'mate' ? [1, 3] : [2, 4]).includes(puzzle.objective.plies)
      && puzzle.objective.target === (puzzle.theme === 'material' ? 3 : 0)
      && puzzle.solution[0] === puzzle.firstMove
      && puzzle.rootMoves === board.moves().length
      && !board.isGameOver()
    if (!valid) ctx.addIssue({ code: 'custom', message: 'Stored puzzle metadata does not match its position.' })
    const replay = new Chess(puzzle.fen)
    for (const next of puzzle.solution) replay.move(next)
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: `Stored puzzle cannot be replayed: ${error instanceof Error ? error.message : String(error)}` })
  }
})

const player = z.object({ name: z.string().max(36), rating: z.number().int().min(100).max(3500) })
const puzzleOptions = z.object({ theme, difficulty: z.enum(['auto', 'gentle', 'balanced', 'deep']) })
export const preferencesSchema = z.object({
  players: z.tuple([player, player]),
  swapped: z.boolean(),
  tab: z.enum(['balance', 'puzzles']),
  puzzleOptions: z.object({ w: puzzleOptions, b: puzzleOptions }),
})
export type Preferences = z.infer<typeof preferencesSchema>
export type PuzzleOptions = z.infer<typeof puzzleOptions>

const storeSchema = z.object({
  version: z.literal(1),
  preferences: preferencesSchema,
  puzzles: z.array(puzzleSchema).max(6),
  recentPositions: z.array(z.string().max(100)).max(50),
})
export type SavedData = z.infer<typeof storeSchema>

export const DEFAULT_DATA: SavedData = {
  version: 1,
  preferences: {
    players: [{ name: '', rating: 1000 }, { name: '', rating: 1600 }],
    swapped: false,
    tab: 'balance',
    puzzleOptions: {
      w: { theme: 'defend', difficulty: 'auto' },
      b: { theme: 'mate', difficulty: 'auto' },
    },
  },
  puzzles: [],
  recentPositions: [],
}

export function loadSavedData(storage: Pick<Storage, 'getItem'>): { data: SavedData; error: string | null } {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { data: DEFAULT_DATA, error: null }
    if (raw.length > 100_000) throw new Error('Saved data exceeds the supported size.')
    const parsed = storeSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) throw new Error('Saved settings or puzzles are invalid or from an unsupported version.')
    return { data: parsed.data, error: null }
  } catch (error) {
    return {
      data: DEFAULT_DATA,
      error: `Local history could not be restored. Nothing was overwritten. ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function saveData(storage: Pick<Storage, 'setItem'>, data: SavedData): void {
  const valid = storeSchema.parse(data)
  storage.setItem(STORAGE_KEY, JSON.stringify(valid))
}
