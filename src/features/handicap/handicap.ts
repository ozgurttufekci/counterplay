import { Chess, DEFAULT_POSITION } from 'chess.js'
import type { Color, Square } from 'chess.js'
import type { Player } from '../../chess/types'

export type Handicap = 'none' | 'pawn' | 'bishop' | 'knight' | 'rook' | 'queen'
export const ODDS_VERSION = 1
export const ODDS: Record<Handicap, { label: string; severity: number; squares: Record<Color, Square> | null }> = {
  none: { label: 'Even material', severity: 0, squares: null },
  pawn: { label: 'Pawn odds', severity: 1, squares: { w: 'f2', b: 'f7' } },
  bishop: { label: 'Bishop odds', severity: 2, squares: { w: 'c1', b: 'c8' } },
  knight: { label: 'Knight odds', severity: 2, squares: { w: 'b1', b: 'b8' } },
  rook: { label: 'Rook odds', severity: 3, squares: { w: 'a1', b: 'a8' } },
  queen: { label: 'Queen odds', severity: 4, squares: { w: 'd1', b: 'd8' } },
}
export const TIERS: Handicap[] = ['none', 'pawn', 'bishop', 'rook', 'queen']
export const ODDS_BANDS = [
  { min: 0, max: 149, handicap: 'none' },
  { min: 150, max: 349, handicap: 'pawn' },
  { min: 350, max: 649, handicap: 'bishop' },
  { min: 650, max: 999, handicap: 'rook' },
  { min: 1000, max: 3400, handicap: 'queen' },
] as const

export function parseRating(input: string): { value: number; error?: never } | { error: string; value?: never } {
  if (!input.trim()) return { error: 'Enter a rating.' }
  if (!/^\d+$/.test(input.trim())) return { error: 'Use a whole-number rating.' }
  const rating = Number(input)
  if (!Number.isSafeInteger(rating) || rating < 100 || rating > 3500) {
    return { error: 'Use a rating from 100 to 3500.' }
  }
  return { value: rating }
}

export function matchup(players: [Player, Player], swapped: boolean) {
  for (const player of players) {
    if (!Number.isInteger(player.rating) || player.rating < 100 || player.rating > 3500) {
      throw new Error('Ratings must be whole numbers between 100 and 3500.')
    }
  }
  const firstIsWhite = (players[0].rating <= players[1].rating) !== swapped
  const white = firstIsWhite ? players[0] : players[1]
  const black = firstIsWhite ? players[1] : players[0]
  const gap = Math.abs(white.rating - black.rating)
  const stronger: Color | null = white.rating === black.rating ? null : white.rating > black.rating ? 'w' : 'b'
  const band = ODDS_BANDS.find((item) => gap >= item.min && gap <= item.max)
  if (!band) throw new Error('No handicap band covers these ratings.')
  return { white, black, gap, stronger, recommendation: band.handicap, outsideConfidence: gap > 1400 }
}

export type Matchup = ReturnType<typeof matchup>

export function handicapPosition(handicap: Handicap, stronger: Color | null) {
  const template = ODDS[handicap]
  if (!template.squares) return { fen: DEFAULT_POSITION, removed: null }
  if (!stronger) throw new Error('Material odds require one higher-rated player.')
  const chess = new Chess()
  const square = template.squares[stronger]
  const removed = chess.remove(square)
  if (!removed || removed.type === 'k' || removed.color !== stronger) {
    throw new Error('The handicap template removed an unexpected piece.')
  }
  if (removed.type === 'r') {
    chess.setCastlingRights(stronger, { q: false })
  }
  return { fen: chess.fen(), removed: { ...removed, square } }
}
