import type { Color } from 'chess.js'

export type Difficulty = 'gentle' | 'balanced' | 'deep'
export type Theme = 'mate' | 'defend' | 'material'

export interface Player {
  name: string
  rating: number
}

export interface GamePosition {
  initialFen?: string
  moves: string[]
}

export interface Objective {
  theme: Theme
  solver: Color
  plies: number
  target: number
  baseline: number
}

export interface Puzzle {
  id: string
  fen: string
  position: GamePosition
  seed: number
  color: Color
  theme: Theme
  difficulty: Difficulty
  objective: Objective
  solution: string[]
  firstMove: string
  rootMoves: number
  engine: string
  generatedAt: string
  verification: {
    nodes: number
    engineNodes: number
    candidates: number
    elapsedMs: number
    version: number
  }
}

export const COLORS: Record<Color, string> = { w: 'White', b: 'Black' }
export const THEMES: Record<Theme, string> = {
  mate: 'Find the mate',
  defend: 'Avoid mate',
  material: 'Win material',
}
export const DIFFICULTIES: Record<Difficulty, string> = {
  gentle: 'Gentle',
  balanced: 'Challenging',
  deep: 'Deep',
}

export function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

export function ratingDifficulty(rating: number): Difficulty {
  return rating < 1100 ? 'gentle' : rating < 1700 ? 'balanced' : 'deep'
}
