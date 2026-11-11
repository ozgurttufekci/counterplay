import { fromPosition, uci } from '../../chess/rules'
import type { Puzzle } from '../../chess/types'
import { prove, reachedObjective, SearchBudget } from './verify'

export interface Grade {
  accepted: boolean
  complete: boolean
  moves: string[]
  continuation: string[]
  message: string
}

export function gradeMove(puzzle: Puzzle, played: string[], attempted: string): Grade {
  const chess = fromPosition(puzzle.position)
  for (const move of played) chess.move(move)
  if (chess.turn() !== puzzle.color || played.length >= puzzle.objective.plies || chess.isGameOver()) {
    throw new Error('This puzzle is not waiting for a player move. Reset it to try again.')
  }
  if (!chess.moves({ verbose: true }).some((move) => uci(move) === attempted)) {
    return { accepted: false, complete: false, moves: [], continuation: [], message: 'That move is not legal in this position.' }
  }
  chess.move(attempted)
  const proof = prove(chess, puzzle.objective, puzzle.objective.plies - played.length - 1, new SearchBudget(250_000))
  if (proof.status === 'unknown') throw new Error('This continuation could not be fully checked within the verification budget. Try again or reset the puzzle.')
  if (proof.status === 'disproven') {
    return {
      accepted: false,
      complete: false,
      moves: [],
      continuation: [],
      message: puzzle.theme === 'defend'
        ? 'The opponent can still force mate within the stated horizon. Try another defense.'
        : puzzle.theme === 'mate'
          ? 'There is a defense to that line. Try another move.'
          : 'The opponent can prevent the required material gain. Look for a stronger continuation.',
    }
  }
  const moves = [attempted]
  if (!reachedObjective(chess, puzzle.objective, played.length + 1)) {
    const reply = proof.line[0]
    if (!reply) throw new Error('A verified continuation was missing its opponent reply.')
    chess.move(reply)
    moves.push(reply)
  }
  const complete = reachedObjective(chess, puzzle.objective, played.length + moves.length)
  return {
    accepted: true,
    complete,
    moves,
    continuation: proof.line.slice(moves.length - 1),
    message: complete ? 'Objective complete. Every move in your line holds up.' : 'Good move. The opponent has replied; find your continuation.',
  }
}
