import { useState } from 'react'
import type { Color } from 'chess.js'
import { ChessBoard } from '../../components/ChessBoard'
import { Icon } from '../../components/Icon'
import { PlayerBadge } from '../../components/PlayerBadge'
import { COLORS, opposite } from '../../chess/types'
import { downloadText, errorMessage } from '../../chess/export'
import { pgnPlayerName, setupPgn } from '../../chess/rules'
import { handicapPosition, ODDS, ODDS_BANDS, TIERS } from './handicap'
import type { Handicap, Matchup } from './handicap'

export function HandicapView({ match }: { match: Matchup }) {
  const [override, setOverride] = useState<Handicap | null>(null)
  const [orientation, setOrientation] = useState<Color>('w')
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null)
  const selected = override ?? match.recommendation
  const { fen, removed } = handicapPosition(selected, match.stronger)
  const severity = ODDS[selected].severity
  const upper = orientation === 'w' ? match.black : match.white
  const lower = orientation === 'w' ? match.white : match.black
  const removeDescription = removed ? `${COLORS[removed.color]}'s ${selected} on ${removed.square}` : 'No pieces removed'

  const adjust = (handicap: Handicap | undefined) => {
    if (!handicap) return
    setOverride(handicap)
    setFeedback(null)
  }

  return (
    <section className="balance-layout" aria-label="Handicap setup">
      <div className="setup-board-panel">
        <div className="panel-kicker"><span><span className="status-dot" /> YOUR STARTING POSITION</span><button className="icon-button" title="Flip board" aria-label="Flip handicap board" onClick={() => setOrientation(opposite(orientation))}><Icon name="swap" size={17} /></button></div>
        <PlayerBadge player={upper} color={opposite(orientation)} note={removed?.color === opposite(orientation) ? `without a ${selected}` : undefined} />
        <ChessBoard fen={fen} orientation={orientation} label="Handicap chessboard" highlighted={removed ? [removed.square] : []} />
        <PlayerBadge player={lower} color={orientation} note={removed?.color === orientation ? `without a ${selected}` : undefined} />
        <div className="board-caption"><span>White moves first</span><span>{removed ? `Remove ${selected} from ${removed.square}` : 'Standard starting position'}</span></div>
      </div>

      <div className="odds-sidebar">
        <section className="recommendation-card">
          <div className="eyebrow"><Icon name="balance" size={17} /> {override && override !== match.recommendation ? 'YOUR ADJUSTMENT' : 'SUGGESTED START'}</div>
          <h2>{ODDS[selected].label}<span className="heading-period">.</span></h2>
          <p className="recommendation-description">
            {removed
              ? <>The higher-rated player starts without a <strong>{selected}</strong>. The lower-rated player keeps a full army.</>
              : match.gap === 0
                ? 'Matching ratings, matching armies. Start with the ordinary chess position.'
                : 'The rating gap is small enough that removing a whole piece may be too much. Try ordinary chess first.'}
          </p>
          <div className="gap-strip"><span>Rating difference</span><strong>{match.gap} <span>points</span></strong></div>
          <div className="removed-strip"><span className="tiny-square" /><span>{removeDescription}</span></div>
          <div className="estimate-note"><Icon name="info" size={18} /><p><strong>A fairer start, not a formula.</strong> These are adjustable estimates, not guaranteed 50/50 odds. Try a game, then tune the handicap.</p></div>
          {match.outsideConfidence && <p role="status" className="warning-notice">This gap is outside the model's useful confidence range. Queen odds is our maximum suggestion, not a claim that these chances are equal.</p>}
        </section>

        <section className="tuning-card" aria-label="Adjust the handicap">
          <div className="section-heading"><h3>Make it your game</h3>{override !== null && <button className="text-button" onClick={() => setOverride(null)}>Reset suggestion</button>}</div>
          <p className="muted small">Give the higher-rated player lighter or heavier odds.</p>
          <div className="odds-options">
            {(Object.keys(ODDS) as Handicap[]).map((handicap) => (
              <button key={handicap} className={selected === handicap ? 'odds-option selected' : 'odds-option'} aria-pressed={selected === handicap} disabled={!match.stronger && handicap !== 'none'} onClick={() => adjust(handicap)}>
                {handicap === 'none' ? 'None' : handicap[0]?.toUpperCase() + handicap.slice(1)}
              </button>
            ))}
          </div>
          <div className="tuning-stepper">
            <button className="text-button" onClick={() => adjust(TIERS[severity - 1])} disabled={severity === 0}><span aria-hidden="true">-</span> Lighter odds</button>
            <span className="severity-dots" aria-label={`Handicap level ${severity} of 4`}>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={level <= severity ? 'active' : ''} />)}</span>
            <button className="text-button" onClick={() => adjust(TIERS[severity + 1])} disabled={severity === 4 || !match.stronger}>Heavier odds <span aria-hidden="true">+</span></button>
          </div>
        </section>

        <section className="export-card">
          <h3>Take it to the board</h3>
          <p className="muted small">Copy this setup into any app that accepts FEN, or arrange the pieces on your own board.</p>
          <label className="sr-only" htmlFor="setup-fen">Starting position FEN</label>
          <textarea id="setup-fen" className="fen-field" readOnly rows={2} value={fen} onFocus={(event) => event.target.select()} />
          <div className="export-actions">
            <button className="button primary" onClick={async () => {
              try {
                await navigator.clipboard.writeText(fen)
                setFeedback({ error: false, message: 'Starting position copied.' })
              } catch (error) {
                setFeedback({ error: true, message: `Clipboard unavailable. Select and copy the FEN above. ${errorMessage(error)}` })
              }
            }}><Icon name="copy" size={17} /> Copy FEN</button>
            <button className="button secondary" onClick={() => {
              try {
                downloadText('counterplay-setup.pgn', setupPgn(fen, match.white.name || 'White player', match.black.name || 'Black player'))
                const normalized = [match.white.name, match.black.name].some((name) => pgnPlayerName(name) !== name)
                setFeedback({ error: false, message: normalized
                  ? 'Setup PGN download started. Quotes and backslashes in player names were normalized for notation compatibility.'
                  : 'Setup PGN download started.' })
              } catch (error) {
                setFeedback({ error: true, message: `Export failed: ${errorMessage(error)}` })
              }
            }}><Icon name="download" size={17} /> Export PGN</button>
          </div>
          {feedback && <p className={feedback.error ? 'inline-error' : 'success-text'} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
        </section>

        <details className="method-details">
          <summary>How are the odds chosen?<Icon name="chevron" size={16} /></summary>
          <p>Version 1 uses a simple, uncalibrated rating-gap table. These thresholds are product heuristics, not measured human handicap outcomes.</p>
          <dl className="bands-list">{ODDS_BANDS.map((band) => <div key={band.min}><dt>{band.min === 1000 ? '1000+' : `${band.min}-${band.max}`} points</dt><dd>{ODDS[band.handicap].label}</dd></div>)}</dl>
          <p>A bishop and a knight share a tier but can play very differently. Absolute skill, time control, and rating pool all affect practical results.</p>
        </details>
      </div>
    </section>
  )
}
