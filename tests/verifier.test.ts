import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import type { Color } from 'chess.js'
import type { Objective, Puzzle, Theme } from '../src/chess/types'
import { fromPosition, material, uci } from '../src/chess/rules'
import { prove, SearchBudget, verifyRoot } from '../src/features/puzzles/verify'
import { gradeMove } from '../src/features/puzzles/solve'
import { referenceSolutions } from './reference'

const defense = 'r5k1/1p3pp1/p6p/4p3/n7/P1Pp2Pn/3Pb2P/RBB1R1K1 w - - 1 24'
const mateTwo = 'r4b1r/5kpp/ppQ1b3/6B1/4N3/5N2/PP3PPP/R3KB1R w KQ - 4 19'
const materialTwo = 'r3kb1r/6pp/pp2b3/8/4N3/5N2/PPQB1PPP/R3KB1R w KQq - 0 17'

function objective(chess: Chess, theme: Theme, plies: number): Objective {
  return { solver: chess.turn(), theme, plies, target: theme === 'material' ? 3 : 0, baseline: material(chess, chess.turn()) }
}

function puzzleFrom(fen: string, theme: Theme, plies: number): Puzzle {
  const chess = new Chess(fen)
  const goal = objective(chess, theme, plies)
  const proof = verifyRoot(chess, goal, new SearchBudget(250_000))
  const first = proof.solutions[0]
  if (proof.status !== 'proven' || !first) throw new Error('Invalid test fixture')
  return {
    id: 'test', fen, position: { initialFen: fen, moves: [] }, seed: 1, color: chess.turn(), theme,
    difficulty: 'deep', objective: goal, firstMove: first.move, solution: first.proof.line, rootMoves: chess.moves().length,
    engine: 'test fixture', generatedAt: new Date(0).toISOString(),
    verification: { nodes: proof.nodes, engineNodes: 0, candidates: 1, elapsedMs: 0, version: 1 },
  }
}

function reverse(fen: string): string {
  const [board, turn, rights, ep, halfmove, fullmove] = fen.split(' ')
  if (!board || ep !== '-') throw new Error('This fixture cannot be reversed')
  const swapped = board.split('/').reverse().map((rank) => [...rank].map((piece) => (
    piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase()
  )).join('')).join('/')
  const castling = (rights ?? '-').replace(/[kqKQ]/g, (right) => right === right.toUpperCase() ? right.toLowerCase() : right.toUpperCase())
  return `${swapped} ${turn === 'w' ? 'b' : 'w'} ${castling} - ${halfmove} ${fullmove}`
}

describe('objective verifier', () => {
  it.each([
    ['mate', mateTwo, 3],
    ['defend', defense, 4],
    ['material', materialTwo, 4],
  ] as const)('independently checks %s for both colors', (theme, fen, plies) => {
    for (const position of [fen, reverse(fen)]) {
      const chess = new Chess(position)
      const goal = objective(chess, theme, plies)
      const proof = verifyRoot(chess, goal, new SearchBudget(250_000))
      expect(proof.status).toBe('proven')
      expect(proof.solutions).toHaveLength(1)
      expect(proof.solutions.map((solution) => solution.move)).toEqual(referenceSolutions(chess.fen(), goal).solutions)
      expect(chess.fen()).toBe(new Chess(position).fen())
    }
  })

  it('never treats an exhausted budget as a solution or an invalid move', () => {
    const chess = new Chess(mateTwo)
    expect(verifyRoot(chess, objective(chess, 'mate', 3), new SearchBudget(0)).status).toBe('unknown')
    expect(chess.fen()).toBe(mateTwo)
  })

  it('rejects an ordinary position as a unique defensive puzzle', () => {
    const chess = new Chess()
    const proof = verifyRoot(chess, objective(chess, 'defend', 2), new SearchBudget(5000))
    expect(proof.status).toBe('disproven')
    expect(proof.solutions.length).toBeGreaterThan(1)
  })

  it('counts recaptures, not just the first captured piece', () => {
    const chess = new Chess('3r2k1/6pp/8/3b4/8/8/6PP/3R2K1 w - - 0 1')
    const goal = objective(chess, 'material', 2)
    chess.move('d1d5')
    expect(material(chess, 'w') - goal.baseline).toBe(3)
    expect(prove(chess, goal, 1, new SearchBudget(5000)).status).toBe('disproven')
  })

  it('does not mistake stalemate or rule draws for mate or a material win', () => {
    for (const theme of ['mate', 'material', 'defend'] as const) {
      const chess = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
      const goal = { ...objective(chess, theme, 1), solver: 'w' as Color }
      expect(prove(chess, goal, 1, new SearchBudget(20)).status).toBe(theme === 'defend' ? 'proven' : 'disproven')
    }
  })

  it('keeps repetition history when reconstructing a position', () => {
    const moves = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']
    expect(fromPosition({ moves }).isThreefoldRepetition()).toBe(true)
  })

  it('considers underpromotions and en-passant as distinct legal moves', () => {
    const promotion = new Chess('8/1P6/8/8/8/8/2k5/K7 w - - 0 1')
    expect(promotion.moves({ verbose: true }).filter((move) => move.promotion).map(uci).sort())
      .toEqual(['b7b8b', 'b7b8n', 'b7b8q', 'b7b8r'])
    const enPassant = new Chess('6k1/8/8/3pP3/8/8/8/6K1 w - d6 0 20')
    const before = material(enPassant, 'w')
    enPassant.move('e5d6')
    expect(material(enPassant, 'w') - before).toBe(1)
  })

  it('finds and grades a uniquely mating knight underpromotion', () => {
    const puzzle = puzzleFrom('6br/5P1k/5K1p/8/8/8/8/8 w - - 0 1', 'mate', 1)
    expect(puzzle.firstMove).toBe('f7f8n')
    expect(gradeMove(puzzle, [], 'f7f8q').accepted).toBe(false)
    expect(gradeMove(puzzle, [], 'f7f8n')).toMatchObject({ accepted: true, complete: true })
  })
})

describe('interactive solution grading', () => {
  it('requires the entire mate sequence, and handles the automatic opponent reply', () => {
    const puzzle = puzzleFrom(mateTwo, 'mate', 3)
    const first = gradeMove(puzzle, [], puzzle.firstMove)
    expect(first.accepted).toBe(true)
    expect(first.complete).toBe(false)
    expect(first.moves).toHaveLength(2)
    const continuation = first.continuation[0]
    if (!continuation) throw new Error('Missing fixture continuation')
    expect(gradeMove(puzzle, first.moves, continuation).complete).toBe(true)
  })

  it('accepts every valid later defensive continuation', () => {
    const puzzle = puzzleFrom(defense, 'defend', 4)
    const first = gradeMove(puzzle, [], puzzle.firstMove)
    const board = fromPosition(puzzle.position)
    for (const move of first.moves) board.move(move)
    const rest = { ...puzzle.objective, plies: puzzle.objective.plies - first.moves.length }
    const allowed = verifyRoot(board, rest, new SearchBudget(250_000), false).solutions
    expect(allowed.length).toBeGreaterThan(1)
    for (const alternative of allowed) {
      expect(gradeMove(puzzle, first.moves, alternative.move)).toMatchObject({ accepted: true, complete: true })
    }
  })

  it('rejects legal wrong moves with explicit feedback and no board advancement', () => {
    const puzzle = puzzleFrom(defense, 'defend', 2)
    const wrong = new Chess(puzzle.fen).moves({ verbose: true }).find((move) => uci(move) !== puzzle.firstMove)
    if (!wrong) throw new Error('Missing wrong-move fixture')
    expect(gradeMove(puzzle, [], uci(wrong))).toMatchObject({ accepted: false, complete: false, moves: [] })
    expect(gradeMove(puzzle, [], 'a1a8').message).toContain('not legal')
  })
})
