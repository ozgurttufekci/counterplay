import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import type { Objective, Puzzle } from '../src/chess/types'

// Deliberately separate from the production minimax, ordering, and terminal helpers.
export function referenceSolutions(fen: string, objective: Objective, history: string[] = []) {
  const board = history.length ? new Chess() : new Chess(fen)
  for (const move of history) board.move(move)
  assert.equal(board.fen(), fen, 'The move prefix must reproduce the exact puzzle position')
  let nodes = 0
  const weights = { p: 1, b: 3, n: 3, r: 5, q: 9, k: 0 }
  const holds = (remaining: number): boolean => {
    nodes += 1
    if (nodes > 2_000_000) throw new Error('Independent verification exceeded two million nodes')
    let gain = -objective.baseline
    for (const row of board.board()) {
      for (const piece of row) {
        if (piece) gain += weights[piece.type] * (piece.color === objective.solver ? 1 : -1)
      }
    }
    if (board.isCheckmate()) {
      return board.turn() !== objective.solver && (objective.theme !== 'material' || gain >= objective.target)
    }
    if (board.isDraw()) return objective.theme === 'defend'
    if (!remaining) return objective.theme === 'defend' || (objective.theme === 'material' && gain >= objective.target)
    const ourTurn = board.turn() === objective.solver
    for (const move of board.moves()) {
      board.move(move)
      const won = holds(remaining - 1)
      board.undo()
      if (won === ourTurn) return ourTurn
    }
    return !ourTurn
  }
  const solutions: string[] = []
  for (const move of board.moves({ verbose: true })) {
    board.move(move)
    const success = holds(objective.plies - 1)
    board.undo()
    if (success) solutions.push(`${move.from}${move.to}${move.promotion ?? ''}`)
  }
  return { solutions, nodes }
}

export function auditPuzzle(puzzle: Puzzle) {
  assert.equal(puzzle.position.initialFen, undefined, 'Fresh puzzles must start from ordinary chess')
  assert.ok(puzzle.position.moves.length >= 22 && puzzle.position.moves.length <= 69)
  const board = new Chess()
  for (const move of puzzle.position.moves) board.move(move)
  assert.equal(board.turn(), puzzle.color)
  assert.equal(board.fen(), puzzle.fen)
  const pieces = board.board().flat().filter((piece) => piece !== null)
  assert.ok(pieces.length >= 12)
  assert.ok(pieces.filter((piece) => piece.type !== 'p' && piece.type !== 'k').length >= 4)
  const check = referenceSolutions(puzzle.fen, puzzle.objective, puzzle.position.moves)
  assert.deepEqual(check.solutions, [puzzle.firstMove], 'Exactly one first move must achieve the advertised objective')
  assert.equal(puzzle.solution[0], puzzle.firstMove)
  for (const move of puzzle.solution) board.move(move)
  if (puzzle.theme === 'mate') {
    assert.ok(board.isCheckmate())
    assert.equal(puzzle.solution.length, puzzle.objective.plies, 'Do not dress a mate in one up as a deeper puzzle')
  } else {
    assert.ok(!board.isCheckmate() || board.turn() !== puzzle.color)
    assert.ok(board.isGameOver() || puzzle.solution.length === puzzle.objective.plies)
  }
  return check.nodes
}
