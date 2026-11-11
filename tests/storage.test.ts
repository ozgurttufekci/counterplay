import { describe, expect, it } from 'vitest'
import { DEFAULT_DATA, loadSavedData, saveData, STORAGE_KEY } from '../src/storage'

describe('bounded local persistence', () => {
  it('round-trips the supported preferences and isolates its storage key', () => {
    const values = new Map<string, string>([['unrelated', 'keep me']])
    saveData({ setItem: (key, value) => { values.set(key, value) } }, DEFAULT_DATA)
    expect(loadSavedData({ getItem: (key) => values.get(key) ?? null })).toEqual({ data: DEFAULT_DATA, error: null })
    expect(values.get('unrelated')).toBe('keep me')
    expect(values.has(STORAGE_KEY)).toBe(true)
  })

  it.each([
    '{',
    JSON.stringify({ ...DEFAULT_DATA, version: 99 }),
    JSON.stringify({ ...DEFAULT_DATA, recentPositions: Array.from({ length: 51 }, () => 'position') }),
    JSON.stringify({ ...DEFAULT_DATA, puzzles: [{ fen: 'not a board' }] }),
    ' '.repeat(100_001),
  ])('reports corrupt, unsupported, or oversized storage instead of silently replacing it', (raw) => {
    const result = loadSavedData({ getItem: () => raw })
    expect(result.error).toContain('Nothing was overwritten')
    expect(result.data).toEqual(DEFAULT_DATA)
  })

  it('surfaces write failures to the UI caller', () => {
    expect(() => saveData({ setItem: () => { throw new Error('Quota exceeded') } }, DEFAULT_DATA)).toThrow('Quota exceeded')
  })

  it('reports blocked storage explicitly', () => {
    expect(loadSavedData({ getItem: () => { throw new Error('Access denied') } }).error).toContain('Access denied')
  })
})
