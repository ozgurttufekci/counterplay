import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from './components/Icon'
import { AboutDialog } from './components/AboutDialog'
import { HandicapView } from './features/handicap/HandicapView'
import { matchup, parseRating } from './features/handicap/handicap'
import { PuzzleLab } from './features/puzzles/PuzzleLab'
import { PuzzleService } from './features/puzzles/client'
import { DEFAULT_DATA, loadSavedData, saveData, STORAGE_KEY } from './storage'
import type { SavedData } from './storage'
import type { Player, Puzzle } from './chess/types'
import { COLORS } from './chess/types'
import { positionKey } from './chess/rules'
import { errorMessage } from './chess/export'

function initialData() {
  try {
    return loadSavedData(localStorage)
  } catch (error) {
    return { data: DEFAULT_DATA, error: `Local storage is unavailable: ${errorMessage(error)}` }
  }
}

export default function App() {
  const [initial] = useState(initialData)
  const [data, setData] = useState<SavedData>(initial.data)
  const [draftPlayers, setDraftPlayers] = useState(() => initial.data.preferences.players.map((player) => ({ name: player.name, rating: String(player.rating) })))
  const [storageError, setStorageError] = useState(initial.error)
  const [about, setAbout] = useState(false)
  const [service] = useState(() => new PuzzleService())
  const { preferences } = data
  const puzzlesActive = preferences.tab === 'puzzles'

  const parsedPlayers = useMemo((): [Player, Player] | null => {
    const [first, second] = draftPlayers
    if (!first || !second) throw new Error('The app needs exactly two players.')
    const firstRating = parseRating(first.rating)
    const secondRating = parseRating(second.rating)
    if (firstRating.value === undefined || secondRating.value === undefined) return null
    return [{ name: first.name.trim(), rating: firstRating.value }, { name: second.name.trim(), rating: secondRating.value }]
  }, [draftPlayers])
  const players = useMemo((): [Player, Player] | null => parsedPlayers
    ? [{ ...parsedPlayers[0], name: parsedPlayers[0].name || 'Player one' }, { ...parsedPlayers[1], name: parsedPlayers[1].name || 'Player two' }]
    : null, [parsedPlayers])
  const match = useMemo(() => players ? matchup(players, preferences.swapped) : null, [players, preferences.swapped])

  useEffect(() => () => service.dispose(), [service])
  useEffect(() => {
    if (storageError || !parsedPlayers) return
    try {
      saveData(localStorage, { ...data, preferences: { ...data.preferences, players: parsedPlayers } })
    } catch (error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Report the failed external write once; the error guard prevents further writes.
      setStorageError(`Changes could not be saved on this device. ${errorMessage(error)}`)
    }
  }, [data, parsedPlayers, storageError])

  const recordPuzzle = useCallback((puzzle: Puzzle) => {
    setData((current) => ({
      ...current,
      puzzles: [puzzle, ...current.puzzles.filter((existing) => positionKey(existing.fen) !== positionKey(puzzle.fen))].slice(0, 6),
      recentPositions: [...new Set([positionKey(puzzle.fen), ...current.recentPositions])].slice(0, 50),
    }))
  }, [])

  const setTab = (tab: 'balance' | 'puzzles') => setData((current) => ({ ...current, preferences: { ...current.preferences, tab } }))

  return (
    <div className="app">
      <a className="skip-link" href="#workspace">Skip to chess workspace</a>
      <header className="site-header">
        <a className="brand" href="./" aria-label="Counterplay home"><span className="brand-mark"><Icon name="knight" size={28} /></span><span>counterplay<span className="brand-subtitle">ODDS &amp; TACTICS</span></span></a>
        <nav className="mode-tabs" role="tablist" aria-label="App mode" onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            const next = puzzlesActive ? 'balance' : 'puzzles'
            setTab(next)
            event.currentTarget.querySelector<HTMLButtonElement>(`#tab-${next}`)?.focus()
          }
        }}>
          <button id="tab-balance" role="tab" aria-selected={!puzzlesActive} aria-controls="panel-balance" tabIndex={puzzlesActive ? -1 : 0} className={!puzzlesActive ? 'active' : ''} onClick={() => setTab('balance')}><Icon name="balance" size={18} /><span>Balance a Game</span></button>
          <button id="tab-puzzles" role="tab" aria-selected={puzzlesActive} aria-controls="panel-puzzles" tabIndex={puzzlesActive ? 0 : -1} className={puzzlesActive ? 'active' : ''} onClick={() => setTab('puzzles')}><Icon name="spark" size={18} /><span>Puzzle Lab</span></button>
        </nav>
        <button className="about-button" onClick={() => setAbout(true)}><Icon name="info" size={17} /><span>How it works</span></button>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy"><div className="eyebrow"><span className="short-rule" />{puzzlesActive ? 'A POSITION WORTH THINKING ABOUT' : 'CHESS, ON MORE EVEN TERMS'}</div><h1>{puzzlesActive ? <>Find your next<br /><em>brilliant move.</em></> : <>Different ratings.<br /><em>Same fighting chance.</em></>}</h1><p>{puzzlesActive ? 'Fresh middlegames. Real threats. A challenge for each side of the board, made for your level.' : 'Bring your ratings. We will bring a more interesting starting position. A little less material, a lot more game.'}</p></div>
          <div className="hero-note"><span className="hero-note-icon"><Icon name={puzzlesActive ? 'spark' : 'knight'} size={42} /></span><div><span>{puzzlesActive ? 'NO PUZZLE BANK' : 'ONE BOARD. TWO PLAYERS.'}</span><p>{puzzlesActive ? 'Generated from legal play.\nChecked before your first move.' : 'A thoughtful advantage.\nA game worth playing.'}</p></div><span className="hero-note-line" /></div>
        </section>

        {storageError && <div className="storage-warning" role="alert"><Icon name="info" size={20} /><div><strong>Your browser could not save or restore local history.</strong><p>{storageError}</p></div><button className="button small-button secondary" onClick={() => {
          try {
            localStorage.removeItem(STORAGE_KEY)
            setData((current) => ({ ...current, puzzles: [], recentPositions: [] }))
            setStorageError(null)
          } catch (error) {
            setStorageError(`Local storage is still unavailable. You can continue without saving. ${errorMessage(error)}`)
          }
        }}>Reset local history</button></div>}

        <section className="matchup-panel" aria-label="Player settings">
          <div className="matchup-heading"><h2>The matchup</h2><span>Two ratings. One good game.</span></div>
          <div className="player-inputs">
            {draftPlayers.map((player, index) => {
              const rating = parseRating(player.rating)
              const color = match && players ? (match.white === players[index] ? 'w' : 'b') : null
              const word = index === 0 ? 'one' : 'two'
              return (
                <div key={index} className={`player-input-card player-${word}`}>
                  <div className="player-input-top"><span className="eyebrow">PLAYER {word.toUpperCase()}</span>{color && <span className="assigned-color"><i className={`color-dot ${color}`} />{COLORS[color]}</span>}</div>
                  <div className="player-fields"><label className="name-field"><span>Name <small>optional</small></span><input aria-label={`Player ${word} name`} placeholder={`Player ${word}`} maxLength={36} value={player.name} onChange={(event) => setDraftPlayers((current) => current.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} /></label><label className="rating-field"><span>Elo / rating</span><input aria-label={`Player ${word} rating`} inputMode="numeric" autoComplete="off" spellCheck={false} value={player.rating} aria-invalid={!!rating.error} aria-describedby={rating.error ? `rating-error-${index}` : 'rating-context'} onChange={(event) => setDraftPlayers((current) => current.map((entry, i) => i === index ? { ...entry, rating: event.target.value } : entry))} /></label></div>
                  {rating.error && <p id={`rating-error-${index}`} className="inline-error" role="alert">{rating.error}</p>}
                </div>
              )
            })}
            <div className="versus" aria-hidden="true">vs</div>
          </div>
          <div className="matchup-footer"><p id="rating-context"><Icon name="info" size={15} /> Use ratings from the same platform and time control.</p><button className="text-button" onClick={() => setData((current) => ({ ...current, preferences: { ...current.preferences, swapped: !current.preferences.swapped } }))}><Icon name="swap" size={15} /> Swap colors</button></div>
        </section>

        <div id="workspace" tabIndex={-1}>
          <div className="workspace-heading"><div><span className="eyebrow">{puzzlesActive ? '02 / TACTICAL THINKING' : '01 / FIND THE BALANCE'}</span><h2>{puzzlesActive ? 'A challenge on both sides.' : 'Your board. A better balance.'}</h2></div><span className="privacy-badge"><Icon name="shield" size={15} /> Runs on your device</span></div>
          <div id={`panel-${preferences.tab}`} role="tabpanel" aria-labelledby={`tab-${preferences.tab}`}>
            {match
              ? puzzlesActive
                ? <PuzzleLab white={match.white} black={match.black} service={service} options={preferences.puzzleOptions} puzzles={data.puzzles} recentPositions={data.recentPositions} onPuzzle={recordPuzzle} onOptions={(color, options) => setData((current) => ({ ...current, preferences: { ...current.preferences, puzzleOptions: { ...current.preferences.puzzleOptions, [color]: options } } }))} />
                : <HandicapView key={`${match.white.rating}-${match.black.rating}`} match={match} />
              : <div className="invalid-match"><Icon name="info" size={28} /><h3>Let's start with two valid ratings.</h3><p>Use whole numbers from 100 to 3500. Your last valid preferences are kept until both ratings are ready.</p></div>}
          </div>
        </div>
      </main>
      <footer className="site-footer"><span className="footer-brand"><Icon name="knight" size={20} /> Counterplay <span>A little more game.</span></span><div><span>No accounts. No analytics.</span><button className="text-button" onClick={() => setAbout(true)}>About &amp; software credits <Icon name="arrow" size={14} /></button></div></footer>
      {about && <AboutDialog onClose={() => setAbout(false)} />}
    </div>
  )
}
