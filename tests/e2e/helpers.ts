import { expect } from '@playwright/test'
import type { Page, Locator } from '@playwright/test'
import { loadSavedData } from '../../src/storage'
import type { Puzzle } from '../../src/chess/types'

export async function seedGeneration(page: Page, seeds: number[]) {
  await page.addInitScript((values) => {
    const original = crypto.getRandomValues
    let index = 0
    crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
      const seed = values[index]
      if (array instanceof Uint32Array && array.length === 1 && seed !== undefined) {
        array[0] = seed
        index += 1
        return array
      }
      original.call(crypto, array)
      return array
    }
  }, seeds)
}

export async function savedPuzzles(page: Page): Promise<Puzzle[]> {
  const raw = await page.evaluate(() => localStorage.getItem('counterplay:v1'))
  const loaded = loadSavedData({ getItem: () => raw })
  if (loaded.error) throw new Error(loaded.error)
  return loaded.data.puzzles
}

export async function waitForPuzzle(page: Page, color: 'w' | 'b') {
  await expect.poll(async () => (await savedPuzzles(page)).some((puzzle) => puzzle.color === color), { timeout: 145_000 }).toBe(true)
  const result = (await savedPuzzles(page)).find((puzzle) => puzzle.color === color)
  if (!result) throw new Error(`No ${color} puzzle was persisted`)
  return result
}

export async function dragMove(page: Page, card: Locator, move: string) {
  const source = card.locator(`.square-hit[data-square="${move.slice(0, 2)}"]`)
  const target = card.locator(`.square-hit[data-square="${move.slice(2, 4)}"]`)
  await source.scrollIntoViewIfNeeded()
  const a = await source.boundingBox()
  const b = await target.boundingBox()
  if (!a || !b) throw new Error('Board squares have no visible area')
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 })
  await page.mouse.up()
}
