import { mkdir, writeFile } from 'node:fs/promises'
import { createNodeEngine } from './node-engine'
import { generatePuzzle, GenerationExhausted, GENERATION_LIMITS } from '../src/features/puzzles/generate'
import type { Difficulty, Theme } from '../src/chess/types'
import { auditPuzzle } from '../tests/reference'

const engine = createNodeEngine()
const themes: Theme[] = ['mate', 'defend', 'material']
const difficulties: Difficulty[] = ['gentle', 'balanced', 'deep']
const phases = process.argv.includes('--matrix') ? ['matrix'] : process.argv.includes('--batch') ? ['batch'] : ['matrix', 'batch']
const results: {
  phase: string; theme: Theme; color: 'w' | 'b'; difficulty: Difficulty; seed: number
  success: boolean; generationMs: number; verificationNodes?: number; referenceNodes?: number
  engineNodes?: number; fen?: string; error?: string; stats?: GenerationExhausted['stats']
}[] = []
let failed = false

try {
  for (const phase of phases) {
    for (const [themeIndex, theme] of themes.entries()) {
      for (const [colorIndex, color] of (['w', 'b'] as const).entries()) {
        const count = phase === 'matrix' ? 3 : 10
        let successes = 0
        for (let index = 0; index < count; index += 1) {
          const difficulty = difficulties[index % difficulties.length]
          if (!difficulty) throw new Error('Qualification difficulty was missing.')
          const seed = (phase === 'matrix' ? 1000 : 10_000) + themeIndex * 100 + colorIndex * 10 + index
          const base = { phase, theme, color, difficulty, seed }
          const start = performance.now()
          try {
            const puzzle = await generatePuzzle(engine, { theme, color, difficulty, seed, excluded: [] })
            const referenceNodes = auditPuzzle(puzzle)
            results.push({
              ...base, success: true, generationMs: puzzle.verification.elapsedMs, referenceNodes,
              verificationNodes: puzzle.verification.nodes, engineNodes: puzzle.verification.engineNodes, fen: puzzle.fen,
            })
            successes += 1
            console.log(`PASS ${phase} ${theme}/${color}/${difficulty} seed=${seed} ${puzzle.verification.elapsedMs}ms proof=${puzzle.verification.nodes} independent=${referenceNodes}`)
          } catch (error) {
            results.push({
              ...base, success: false, generationMs: Math.round(performance.now() - start),
              error: error instanceof Error ? error.message : String(error),
              ...(error instanceof GenerationExhausted ? { stats: error.stats } : {}),
            })
            console.error(`FAIL ${phase} ${theme}/${color}/${difficulty} seed=${seed}: ${error instanceof Error ? error.message : String(error)}`)
            if (!(error instanceof GenerationExhausted)) throw error
          }
        }
        const required = phase === 'matrix' ? 3 : 8
        if (successes < required) failed = true
        console.log(`${phase} ${theme}/${color}: ${successes}/${count} generated and independently verified (required ${required})`)
      }
    }
  }
} finally {
  engine.dispose()
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true })
  const path = new URL(`../test-results/qualification-${phases.join('-')}.json`, import.meta.url)
  await writeFile(path, JSON.stringify({ engine: 'Stockfish.js 19 lite single-threaded', limits: GENERATION_LIMITS, results }, null, 2))
}
if (failed) process.exitCode = 1
