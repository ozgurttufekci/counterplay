import { describe, expect, it } from 'vitest'
import { Chess, DEFAULT_POSITION } from 'chess.js'
import { handicapPosition, matchup, ODDS, ODDS_BANDS, parseRating } from '../src/features/handicap/handicap'
import type { Handicap } from '../src/features/handicap/handicap'
import { setupPgn } from '../src/chess/rules'

describe('transparent material-odds heuristics', () => {
  it.each(ODDS_BANDS)('handles both boundaries of the $handicap tier', ({ min, max, handicap }) => {
    for (const gap of [min, max]) {
      const result = matchup([{ name: 'A', rating: 100 }, { name: 'B', rating: 100 + gap }], false)
      expect(result.recommendation).toBe(handicap)
    }
  })

  it('keeps handicap severity monotonic and warns for extreme gaps', () => {
    let severity = 0
    for (let gap = 0; gap <= 3400; gap += 1) {
      const result = matchup([{ name: 'A', rating: 100 }, { name: 'B', rating: 100 + gap }], false)
      expect(ODDS[result.recommendation].severity).toBeGreaterThanOrEqual(severity)
      severity = ODDS[result.recommendation].severity
      expect(result.outsideConfidence).toBe(gap > 1400)
    }
  })

  it('defaults the lower-rated player to White, and swaps explicitly', () => {
    const players: [{ name: string; rating: number }, { name: string; rating: number }] = [
      { name: 'First', rating: 1800 }, { name: 'Second', rating: 1100 },
    ]
    expect(matchup(players, false)).toMatchObject({ white: players[1], black: players[0], stronger: 'b' })
    expect(matchup(players, true)).toMatchObject({ white: players[0], black: players[1], stronger: 'w' })
    expect(matchup([{ name: 'A', rating: 1000 }, { name: 'B', rating: 1000 }], false))
      .toMatchObject({ white: { name: 'A' }, recommendation: 'none', stronger: null })
  })

  it.each(['', ' ', '99', '3501', '1200.5', 'NaN', 'Infinity', '1e3', '-100'])('rejects invalid rating %j explicitly', (rating) => {
    expect(parseRating(rating).error).toBeTruthy()
  })

  it('accepts only in-range integer ratings', () => {
    for (const value of ['100', '3500', ' 1200 ']) expect(parseRating(value).value).toBe(Number(value))
  })
})

describe('setup position correctness', () => {
  for (const color of ['w', 'b'] as const) {
    it.each(Object.keys(ODDS) as Handicap[])(`removes only the indicated ${color} piece for %s and round-trips notation`, (handicap) => {
      const { fen, removed } = handicapPosition(handicap, color)
      const chess = new Chess(fen)
      const pieces = chess.board().flat().filter((piece) => piece !== null)
      expect(pieces.filter((piece) => piece.type === 'k')).toHaveLength(2)
      expect(pieces.filter((piece) => piece.color !== color)).toHaveLength(16)
      expect(pieces.filter((piece) => piece.color === color)).toHaveLength(handicap === 'none' ? 16 : 15)
      expect(chess.turn()).toBe('w')
      expect(fen.split(' ').slice(3)).toEqual(['-', '0', '1'])
      if (removed) expect(chess.get(removed.square)).toBeUndefined()
      const copy = new Chess()
      copy.loadPgn(setupPgn(fen, 'Player one', 'Player two'))
      expect(copy.fen()).toBe(fen)
    })
  }

  it('clears only the removed rook wing castling right', () => {
    expect(new Chess(handicapPosition('rook', 'w').fen).getCastlingRights('w')).toEqual({ k: true, q: false })
    expect(new Chess(handicapPosition('rook', 'w').fen).getCastlingRights('b')).toEqual({ k: true, q: true })
    expect(new Chess(handicapPosition('bishop', 'b').fen).getCastlingRights('b')).toEqual({ k: true, q: true })
  })

  it('exports player names containing quotes and backslashes without breaking PGN', () => {
    const exported = setupPgn(DEFAULT_POSITION, 'A "Sharp" player', 'B \\ C')
    const copy = new Chess()
    expect(() => copy.loadPgn(exported)).not.toThrow()
    expect(copy.fen()).toBe(DEFAULT_POSITION)
    expect(copy.getHeaders().White).toBe("A 'Sharp' player")
    expect(copy.getHeaders().Black).toBe('B / C')
  })

  it('produces ordinary chess for ties and refuses arbitrary equal-rating removal', () => {
    expect(handicapPosition('none', null).fen).toBe(DEFAULT_POSITION)
    expect(() => handicapPosition('queen', null)).toThrow('higher-rated')
  })
})
