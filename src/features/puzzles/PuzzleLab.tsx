import { useEffect, useRef, useState } from 'react'
import type { Color } from 'chess.js'
import { Icon } from '../../components/Icon'
import { PlayerBadge } from '../../components/PlayerBadge'
import type { Player, Puzzle } from '../../chess/types'
import { COLORS, DIFFICULTIES, ratingDifficulty, THEMES } from '../../chess/types'
import type { PuzzleOptions } from '../../storage'
import type { Progress } from './generate'
import { PuzzleSolver } from './PuzzleSolver'
import type { PuzzleService } from './client'
import { errorMessage } from '../../chess/export'

function SearchProgress({ progress }: { progress: Progress }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="search-progress" role="status">
      <div><span className="spinner" /><strong>{progress.stage === 'verifying' ? 'Testing the tactic' : progress.stage === 'loading' ? 'Preparing the engine' : 'Finding a fresh position'}</strong><time>{seconds}s</time></div>
      <p>{progress.message}</p>
      <div className="indeterminate-track"><span /></div>
      <small>Some searches take up to two minutes. Unverified positions are never shown.</small>
    </div>
  )
}

function PuzzleCard({
  color, player, options, onOptions, service, initialPuzzle, recentPositions, onPuzzle,
}: {
  color: Color
  player: Player
  options: PuzzleOptions
  onOptions: (options: PuzzleOptions) => void
  service: PuzzleService
  initialPuzzle?: Puzzle
  recentPositions: string[]
  onPuzzle: (puzzle: Puzzle) => void
}) {
  const [puzzle, setPuzzle] = useState(initialPuzzle)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const active = useRef<AbortController | null>(null)
  const difficulty = options.difficulty === 'auto' ? ratingDifficulty(player.rating) : options.difficulty
  const mismatch = puzzle && (puzzle.theme !== options.theme || puzzle.difficulty !== difficulty)

  useEffect(() => () => {
    active.current?.abort()
    active.current = null
  }, [])

  const generate = async () => {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setError(null)
    setNotice('')
    setProgress({ stage: 'loading', message: 'Preparing a new seeded search.', candidates: 0, games: 0 })
    try {
      const random = crypto.getRandomValues(new Uint32Array(1))[0]
      if (random === undefined) throw new Error('Unable to obtain a random seed.')
      const generated = await service.generate({
        color, theme: options.theme, difficulty, seed: random, excluded: recentPositions,
      }, controller.signal, setProgress)
      if (controller.signal.aborted) return
      setPuzzle(generated)
      onPuzzle(generated)
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorMessage(failure))
    } finally {
      if (active.current === controller) {
        active.current = null
        setProgress(null)
      }
    }
  }

  return (
    <section className="puzzle-card" aria-label={`${COLORS[color]} puzzle`}>
      <div className="puzzle-card-top"><PlayerBadge player={player} color={color} /><span className="eyebrow">YOUR SIDE OF THE STORY</span></div>
      <div className="puzzle-settings">
        <label>Objective<select aria-label={`${COLORS[color]} puzzle objective`} value={options.theme} disabled={!!progress} onChange={(event) => {
          const value = event.target.value
          if (value === 'mate' || value === 'defend' || value === 'material') onOptions({ ...options, theme: value })
        }}>{Object.entries(THEMES).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label>Difficulty<select aria-label={`${COLORS[color]} puzzle difficulty`} value={options.difficulty} disabled={!!progress} onChange={(event) => {
          const value = event.target.value
          if (value === 'auto' || value === 'gentle' || value === 'balanced' || value === 'deep') onOptions({ ...options, difficulty: value })
        }}><option value="auto">For your rating</option>{Object.entries(DIFFICULTIES).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      </div>
      <div className="generate-row">
        <span className="difficulty-caption">{DIFFICULTIES[difficulty]}<span> / approximate, not puzzle Elo</span></span>
        {progress
          ? <button className="button small-button secondary" onClick={() => {
            active.current?.abort()
            setNotice('Search canceled. Your current puzzle is unchanged.')
          }}><Icon name="close" size={15} /> Cancel</button>
          : <button className="button small-button primary" onClick={generate}><Icon name={puzzle ? 'refresh' : 'spark'} size={15} />{puzzle ? 'New puzzle' : 'Generate puzzle'}</button>}
      </div>
      {progress && <SearchProgress progress={progress} />}
      {error && <div className="generation-error" role="alert"><Icon name="info" size={18} /><div><strong>No puzzle was substituted.</strong><p>{error}</p></div></div>}
      {notice && <p className="muted small" role="status">{notice}</p>}
      {mismatch && <p className="settings-notice">Your current puzzle is {THEMES[puzzle.theme].toLowerCase()} / {DIFFICULTIES[puzzle.difficulty].toLowerCase()}. New settings apply on generation.</p>}
      {puzzle
        ? <PuzzleSolver key={puzzle.id} puzzle={puzzle} service={service} />
        : <div className="puzzle-empty"><div className="empty-board-pattern" /><div className="empty-knight"><Icon name={options.theme === 'defend' ? 'shield' : 'knight'} size={44} /></div><h3>The next move is yours.</h3><p>Generate a real middlegame for {COLORS[color].toLowerCase()} to solve. A new position, a clear objective, and no shortcuts in verification.</p><span><Icon name="shield" size={14} /> Created locally. Checked completely.</span></div>}
    </section>
  )
}

export function PuzzleLab({
  white, black, service, options, puzzles, recentPositions, onPuzzle, onOptions,
}: {
  white: Player
  black: Player
  service: PuzzleService
  options: Record<Color, PuzzleOptions>
  puzzles: Puzzle[]
  recentPositions: string[]
  onPuzzle: (puzzle: Puzzle) => void
  onOptions: (color: Color, options: PuzzleOptions) => void
}) {
  return (
    <div className="puzzle-lab">
      <div className="puzzle-intro-strip"><Icon name="spark" size={18} /><p>Two sides. Two challenges. <span>These are independent puzzles, not continuations of the handicap setup.</span></p></div>
      <div className="puzzle-grid">
        {(['w', 'b'] as const).map((color) => <PuzzleCard
          key={color}
          color={color}
          player={color === 'w' ? white : black}
          options={options[color]}
          onOptions={(updated) => onOptions(color, updated)}
          service={service}
          initialPuzzle={puzzles.find((puzzle) => puzzle.color === color)}
          recentPositions={recentPositions}
          onPuzzle={onPuzzle}
        />)}
      </div>
      <p className="puzzle-footnote"><Icon name="info" size={15} /> Difficulty reflects line length, legal choices, and tactical distractions. It is a guide, not a calibrated rating.</p>
    </div>
  )
}
