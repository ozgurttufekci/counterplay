import { Chess } from 'chess.js'
import type { Color, Move } from 'chess.js'
import { material, positionKey, uci } from '../../chess/rules'
import type { Difficulty, GamePosition, Objective, Puzzle, Theme } from '../../chess/types'
import type { Analysis, Analyzer } from '../../engine/uci'
import { SearchBudget, verifyRoot } from './verify'

export const GENERATION_LIMITS = {
  version: 1,
  games: 140,
  maxPlies: 70,
  requestMs: 120_000,
  probeNodes: 2_000,
  confirmNodes: 24_000,
  verificationNodes: 45_000,
} as const

export interface GenerateRequest {
  color: Color
  theme: Theme
  difficulty: Difficulty
  seed: number
  excluded: string[]
}

export interface Progress {
  stage: 'loading' | 'searching' | 'verifying'
  message: string
  candidates: number
  games: number
}

export class GenerationExhausted extends Error {
  constructor(
    readonly stats: {
      games: number; candidates: number; nodes: number; engineNodes: number; elapsedMs: number
      rejected: Record<string, number>
    },
  ) {
    super('No fully verified puzzle matched these settings within the search budget. Retry with a new seed or choose a different difficulty.')
    this.name = 'GenerationExhausted'
  }
}

function randomSource(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function isMiddlegame(chess: Chess): boolean {
  const move = chess.moveNumber()
  const pieces = chess.board().flat().filter((piece) => piece !== null)
  return move >= 12 && move <= 35 && pieces.length >= 12
    && pieces.filter((piece) => piece.type !== 'p' && piece.type !== 'k').length >= 4
}

export function classifyDifficulty(chess: Chess, objective: Objective, first: Move): Difficulty {
  const moves = chess.moves({ verbose: true })
  const forcing = moves.filter((move) => move.captured || /[+#]/.test(move.san)).length
  const quiet = !first.captured && !/[+#]/.test(first.san)
  const score = (Math.ceil(objective.plies / 2) - 1) * 3
    + (moves.length >= 24 ? 1 : 0)
    + (forcing >= 5 ? 1 : 0)
    + (quiet ? 1 : 0)
  return score <= 1 ? 'gentle' : score <= 3 ? 'balanced' : 'deep'
}

function objectiveCandidates(chess: Chess, request: GenerateRequest): Objective[] {
  const base = { theme: request.theme, solver: request.color, baseline: material(chess, request.color), target: 0 }
  if (request.theme === 'mate') {
    return [1, 3].map((plies) => ({ ...base, plies }))
  }
  if (request.theme === 'defend') {
    return [2, 4].map((plies) => ({ ...base, plies }))
  }
  return [2, 4].map((plies) => ({ ...base, plies, target: 3 }))
}

function promising(chess: Chess, analysis: Analysis, theme: Theme): boolean {
  const first = analysis.lines[0]
  if (!first) return false
  const score = first.score
  if (theme === 'mate') return score.kind === 'mate' && score.value > 0 && score.value <= 2
  if (theme === 'defend') {
    if (score.kind === 'mate' && score.value < 0) return false
    const second = analysis.lines[1]?.score
    return (second?.kind === 'mate' && second.value < 0 && second.value >= -2)
      || (chess.isCheck() && chess.moves().length >= 2 && chess.moves().length <= 8)
  }
  if (score.kind === 'mate') return false
  if (score.value < 80) return false
  const before = material(chess, chess.turn())
  const color = chess.turn()
  let played = 0
  let gain = false
  for (const move of first.moves.slice(0, 4)) {
    chess.move(move)
    played += 1
    if (material(chess, color) - before >= 3) gain = true
  }
  while (played-- > 0) chess.undo()
  return gain
}

function chooseMove(chess: Chess, analysis: Analysis, request: GenerateRequest, random: () => number): string {
  const solver = chess.turn() === request.color
  const weaker = request.theme === 'defend' ? solver : !solver
  const legal = chess.moves({ verbose: true })
  if (random() < (weaker ? 0.38 : 0.12)) {
    const active = legal.filter((move) => (
      move.piece !== 'k' || chess.isCheck() || move.isKingsideCastle() || move.isQueensideCastle()
    ))
    const pool = active.length ? active : legal
    const choice = pool[Math.floor(random() * pool.length)]
    if (choice) return uci(choice)
  }
  const rank = random() < 0.72 ? 0 : random() < 0.65 ? 1 : 2
  return analysis.lines[rank]?.moves[0] ?? analysis.bestMove
}

export async function generatePuzzle(
  engine: Analyzer,
  request: GenerateRequest,
  onProgress: (progress: Progress) => void = () => {},
): Promise<Puzzle> {
  const start = performance.now()
  const deadline = start + GENERATION_LIMITS.requestMs
  const random = randomSource(request.seed)
  const excluded = new Set(request.excluded)
  const examined = new Set<string>()
  let candidates = 0
  let nodes = 0
  let engineNodes = 0
  let games = 0
  const rejected: Record<string, number> = {}
  const reject = (reason: string) => { rejected[reason] = (rejected[reason] ?? 0) + 1 }
  for (; games < GENERATION_LIMITS.games && performance.now() < deadline; games += 1) {
    const chess = new Chess()
    const position: GamePosition = { moves: [] }
    onProgress({ stage: 'searching', message: `Creating legal middlegames. Game ${games + 1}.`, candidates, games: games + 1 })
    for (let ply = 0; ply < GENERATION_LIMITS.maxPlies && !chess.isGameOver() && performance.now() < deadline; ply += 1) {
      const analysis = await engine.analyze(position, { nodes: GENERATION_LIMITS.probeNodes, multiPv: 3 })
      engineNodes += analysis.nodes
      const key = positionKey(chess.fen())
      if (chess.turn() === request.color && isMiddlegame(chess) && chess.moves().length > 1
        && !excluded.has(key) && !examined.has(key) && promising(chess, analysis, request.theme)) {
        examined.add(key)
        candidates += 1
        onProgress({ stage: 'verifying', message: `Checking every legal first move. Candidate ${candidates}.`, candidates, games: games + 1 })
        for (const objective of objectiveCandidates(chess, request)) {
          const legal = chess.moves({ verbose: true })
          if (!legal.some((move) => classifyDifficulty(chess, objective, move) === request.difficulty)) continue
          const budget = new SearchBudget(GENERATION_LIMITS.verificationNodes, deadline)
          const proof = verifyRoot(chess, objective, budget)
          nodes += budget.nodes
          const solution = proof.solutions[0]
          if (proof.status !== 'proven' || !solution) {
            reject(proof.status === 'unknown' ? 'verification-budget' : proof.solutions.length > 1 ? 'ambiguous' : 'no-solution')
            continue
          }
          if (objective.theme === 'mate' && solution.proof.line.length < objective.plies) {
            reject('shorter-mate')
            continue
          }
          const first = chess.moves({ verbose: true }).find((move) => uci(move) === solution.move)
          if (!first) throw new Error('The verifier returned an illegal solution.')
          const difficulty = classifyDifficulty(chess, objective, first)
          if (difficulty !== request.difficulty) {
            reject(`difficulty-${difficulty}`)
            continue
          }
          const confirm = await engine.analyze(position, {
            nodes: GENERATION_LIMITS.confirmNodes, searchMoves: [solution.move],
          })
          engineNodes += confirm.nodes
          const score = confirm.lines[0]?.score
          if (!score) { reject('missing-engine-score'); continue }
          if (objective.theme === 'mate' && (score.kind !== 'mate' || score.value < 1 || score.value > Math.ceil(objective.plies / 2))) continue
          if (objective.theme === 'defend' && score.kind === 'mate' && score.value < 0) { reject('unstable-defense'); continue }
          if (objective.theme === 'material' && (score.kind !== 'cp' || score.value < 80)) { reject('unstable-material'); continue }
          return {
            id: `${request.seed.toString(16)}-${games}-${ply}`,
            fen: chess.fen(),
            position: { moves: [...position.moves] },
            seed: request.seed,
            color: request.color,
            theme: request.theme,
            difficulty: request.difficulty,
            objective,
            solution: solution.proof.line,
            firstMove: solution.move,
            rootMoves: chess.moves().length,
            engine: 'Stockfish.js 19 lite single-threaded',
            generatedAt: new Date().toISOString(),
            verification: {
              nodes,
              engineNodes,
              candidates,
              elapsedMs: Math.round(performance.now() - start),
              version: GENERATION_LIMITS.version,
            },
          }
        }
      }
      const move = chooseMove(chess, analysis, request, random)
      chess.move(move)
      position.moves.push(move)
    }
  }
  throw new GenerationExhausted({ games, candidates, nodes, engineNodes, elapsedMs: Math.round(performance.now() - start), rejected })
}
