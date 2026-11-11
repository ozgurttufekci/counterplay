import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { Color } from 'chess.js'
import { ChessBoard } from '../../components/ChessBoard'
import { Icon } from '../../components/Icon'
import { describeMove, describeObjective, solutionPgn } from '../../chess/rules'
import { downloadText, errorMessage } from '../../chess/export'
import { COLORS, opposite } from '../../chess/types'
import type { Puzzle } from '../../chess/types'
import type { PuzzleService } from './client'

export function PuzzleSolver({ puzzle, service }: { puzzle: Puzzle; service: PuzzleService }) {
  const [played, setPlayed] = useState<string[]>([])
  const [continuation, setContinuation] = useState(puzzle.solution)
  const [orientation, setOrientation] = useState<Color>(puzzle.color)
  const [complete, setComplete] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [replayStep, setReplayStep] = useState(0)
  const [hintLevel, setHintLevel] = useState(0)
  const [attemptNumber, setAttemptNumber] = useState(0)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success' | 'neutral'; message: string } | null>(null)
  const active = useRef<AbortController | null>(null)

  useEffect(() => () => {
    active.current?.abort()
    active.current = null
  }, [])

  const board = useMemo(() => {
    const chess = new Chess(puzzle.fen)
    for (const move of revealed ? puzzle.solution.slice(0, replayStep) : played) chess.move(move)
    return chess
  }, [puzzle, played, revealed, replayStep])
  const fen = board.fen()
  const movesToShow = revealed ? puzzle.solution : played
  const notation = useMemo(() => {
    const chess = new Chess(puzzle.fen)
    return movesToShow.map((move) => {
      const prefix = `${chess.moveNumber()}${chess.turn() === 'w' ? '.' : '...'}`
      return { prefix, san: chess.move(move).san }
    })
  }, [puzzle.fen, movesToShow])
  const nextHint = continuation[0]
  const last = (revealed ? puzzle.solution.slice(0, replayStep) : played).at(-1)

  const attempt = async (move: string) => {
    if (busy || revealed || complete) return
    const controller = new AbortController()
    active.current = controller
    setBusy(true)
    setFeedback(null)
    try {
      const result = await service.grade(puzzle, played, move, controller.signal)
      if (controller.signal.aborted) return
      setFeedback({ kind: result.accepted ? 'success' : 'error', message: result.message })
      if (result.accepted) {
        setPlayed([...played, ...result.moves])
        setContinuation(result.continuation)
        setComplete(result.complete)
        setHintLevel(0)
      }
    } catch (error) {
      if (!controller.signal.aborted) setFeedback({ kind: 'error', message: errorMessage(error) })
    } finally {
      if (active.current === controller) {
        active.current = null
        setBusy(false)
      }
    }
  }

  const reset = () => {
    active.current?.abort()
    active.current = null
    setBusy(false)
    setPlayed([])
    setContinuation(puzzle.solution)
    setComplete(false)
    setRevealed(false)
    setReplayStep(0)
    setHintLevel(0)
    setAttemptNumber((number) => number + 1)
    setFeedback({ kind: 'neutral', message: 'Fresh attempt. The position is reset.' })
  }

  return (
    <div className="puzzle-solver">
      <div className={`objective-callout ${complete ? 'complete' : ''}`}>
        <Icon name={complete ? 'check' : puzzle.theme === 'defend' ? 'shield' : 'spark'} size={20} />
        <div><span>{complete ? 'NICELY PLAYED' : revealed ? 'SOLUTION REPLAY' : 'YOUR OBJECTIVE'}</span><h3>{describeObjective(puzzle.objective)}</h3></div>
      </div>
      <div className="puzzle-board-toolbar">
        <span><span className={`color-dot ${board.turn()}`} />{COLORS[board.turn()]} to move{board.isCheck() && !board.isCheckmate() ? ' / in check' : ''}</span>
        <button className="icon-button" aria-label={`Flip ${COLORS[puzzle.color]} puzzle board`} title="Flip board" onClick={() => setOrientation(opposite(orientation))}><Icon name="swap" size={17} /></button>
      </div>
      <ChessBoard
        key={revealed ? 'replay' : `play-${complete}-${attemptNumber}`}
        fen={fen}
        orientation={orientation}
        label={`${COLORS[puzzle.color]} puzzle chessboard`}
        interactive={!complete && !revealed}
        busy={busy}
        onMove={attempt}
        highlighted={last ? [last.slice(0, 2), last.slice(2, 4)] : undefined}
      />
      {revealed && (
        <div className="replay-controls">
          <button className="button small-button secondary" onClick={() => setReplayStep(Math.max(0, replayStep - 1))} disabled={replayStep === 0}>Previous</button>
          <span>{replayStep} / {puzzle.solution.length} plies</span>
          <button className="button small-button primary" onClick={() => setReplayStep(Math.min(puzzle.solution.length, replayStep + 1))} disabled={replayStep === puzzle.solution.length}>Next move <Icon name="arrow" size={15} /></button>
        </div>
      )}
      {!!notation.length && (
        <div className="move-list" aria-label={revealed ? 'Solution moves' : 'Moves played'}>
          {notation.map((move, index) => <span key={index} className={revealed && index === replayStep - 1 ? 'current' : ''}><small>{move.prefix}</small> {move.san}</span>)}
        </div>
      )}
      {feedback && <p className={`solver-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</p>}
      {hintLevel > 0 && nextHint && !revealed && !complete && (
        <p className="hint-callout" role="status"><Icon name="spark" size={16} />{hintLevel === 1 ? `Look closely at the piece on ${nextHint.slice(0, 2)}.` : `Consider ${describeMove(fen, nextHint)}. You still need to complete the continuation.`}</p>
      )}
      <div className="solver-actions">
        <button className="button small-button secondary" disabled={busy || complete || revealed || hintLevel === 2} onClick={() => setHintLevel((level) => Math.min(2, level + 1))}><Icon name="spark" size={16} /> Hint{hintLevel ? ` ${hintLevel}/2` : ''}</button>
        <button className="button small-button secondary" disabled={busy || revealed} onClick={() => {
          setRevealed(true)
          setReplayStep(0)
          setFeedback({ kind: 'neutral', message: complete ? 'Replay one verified solution.' : 'Solution revealed. Use Reset to attempt the puzzle again.' })
        }}><Icon name="eye" size={16} /> {complete ? 'Review solution' : 'Show solution'}</button>
        <button className="icon-button reset-puzzle" title="Reset puzzle" aria-label={`Reset ${COLORS[puzzle.color]} puzzle`} onClick={reset}><Icon name="refresh" size={18} /></button>
      </div>
      {(revealed || complete) && (
        <div className="solution-explanation">
          <h4>Why it works</h4>
          <p>{puzzle.theme === 'mate'
            ? `The solver can force checkmate within ${Math.ceil(puzzle.objective.plies / 2)} moves against every legal defense. The replay shows one of the longest defenses.`
            : puzzle.theme === 'defend'
              ? 'Other first moves allow forced mate within the stated horizon. The saving move prevents it against every legal reply. This does not prove a draw or safety forever.'
              : 'The sequence guarantees at least 3 net material points within the stated horizon, including all opponent replies and recaptures. A pawn is 1 point, a minor piece 3, a rook 5, and a queen 9. This is a tactical goal, not a guarantee of winning the game.'}</p>
          <button className="text-button" onClick={() => {
            try {
              downloadText('counterplay-solution.pgn', solutionPgn(puzzle.fen, puzzle.solution))
              setFeedback({ kind: 'success', message: 'Solution PGN download started.' })
            } catch (error) {
              setFeedback({ kind: 'error', message: `Solution export failed: ${errorMessage(error)}` })
            }
          }}><Icon name="download" size={15} /> Export solution PGN</button>
        </div>
      )}
      <details className="puzzle-provenance">
        <summary><Icon name="shield" size={14} /> Freshly generated &amp; verified <Icon name="chevron" size={13} /></summary>
        <p>Created from {puzzle.position.moves.length} legal moves, not a puzzle bank. All {puzzle.rootMoves} legal first moves were checked; only one meets the goal.</p>
        <p>Stockfish 19 lite plus a bounded exhaustive verifier. Seed {puzzle.seed}. Generation {(puzzle.verification.elapsedMs / 1000).toFixed(1)}s. {puzzle.verification.nodes.toLocaleString()} verification nodes.</p>
        <label className="sr-only" htmlFor={`puzzle-fen-${puzzle.id}`}>Puzzle FEN</label>
        <textarea id={`puzzle-fen-${puzzle.id}`} className="fen-field" readOnly rows={2} value={puzzle.fen} onFocus={(event) => event.target.select()} />
      </details>
    </div>
  )
}
