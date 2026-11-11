import { Chess, validateFen } from 'chess.js'
import type { Color, Move, PieceSymbol } from 'chess.js'
import type { GamePosition, Objective } from './types'
import { COLORS } from './types'

export const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

export function uci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

export function fromPosition(position: GamePosition): Chess {
  const chess = new Chess(position.initialFen)
  for (const move of position.moves) chess.move(move)
  return chess
}

export function material(chess: Chess, color: Color): number {
  return chess.board().flat().reduce((sum, piece) => (
    sum + (piece ? VALUES[piece.type] * (piece.color === color ? 1 : -1) : 0)
  ), 0)
}

export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

export function assertPosition(fen: string): Chess {
  const validation = validateFen(fen)
  if (!validation.ok) throw new Error(validation.error)
  return new Chess(fen)
}

export function pgnPlayerName(name: string): string {
  return name.replace(/"/g, "'").replace(/\\/g, '/').replace(/[\r\n]/g, ' ')
}

export function setupPgn(fen: string, white: string, black: string): string {
  const chess = assertPosition(fen)
  chess.header('Event', 'Counterplay material odds', 'White', pgnPlayerName(white), 'Black', pgnPlayerName(black), 'Result', '*')
  // A setup PGN is useful even when the chosen position is the ordinary start.
  chess.header('SetUp', '1', 'FEN', fen)
  return chess.pgn()
}

export function solutionPgn(fen: string, moves: string[]): string {
  const chess = assertPosition(fen)
  chess.header('Event', 'Counterplay puzzle solution', 'SetUp', '1', 'FEN', fen)
  for (const move of moves) chess.move(move)
  return chess.pgn()
}

export function describeObjective(objective: Objective): string {
  const color = COLORS[objective.solver]
  if (objective.theme === 'mate') {
    return `${color} to move. Force mate in ${Math.ceil(objective.plies / 2)}.`
  }
  if (objective.theme === 'defend') {
    const turns = objective.plies / 2
    return `${color} to move. Prevent forced mate over the next ${turns === 1 ? 'opponent move' : `${turns} opponent moves`}.`
  }
  return `${color} to move. Gain at least ${objective.target} material points within ${objective.plies / 2} move${objective.plies === 2 ? '' : 's'}, including the opponent's replies.`
}

export function describeMove(fen: string, move: string): string {
  const chess = new Chess(fen)
  const played = chess.move(move)
  return played.san
}
