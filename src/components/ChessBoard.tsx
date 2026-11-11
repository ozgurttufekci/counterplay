import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess, SQUARES } from 'chess.js'
import type { Color, PieceSymbol, Square } from 'chess.js'
import { uci } from '../chess/rules'
import { Icon } from './Icon'

const names: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

function isSquare(value: string): value is Square {
  return SQUARES.some((square) => square === value)
}

function PromotionDialog({ onChoose, onCancel }: { onChoose: (piece: 'q' | 'r' | 'b' | 'n') => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog ref={dialog} className="promotion-dialog" aria-labelledby={titleId} onCancel={onCancel}>
      <h3 id={titleId}>Choose your promotion</h3>
      <div className="promotion-choices">
        {(['q', 'r', 'b', 'n'] as const).map((piece) => (
          <button key={piece} className="button secondary" onClick={() => onChoose(piece)}>{names[piece]}</button>
        ))}
      </div>
      <button className="text-button" onClick={onCancel}>Cancel move</button>
    </dialog>
  )
}

export function ChessBoard({
  fen, orientation = 'w', interactive = false, busy = false, onMove, label, highlighted,
}: {
  fen: string
  orientation?: Color
  interactive?: boolean
  busy?: boolean
  onMove?: (move: string) => void
  label: string
  highlighted?: string[]
}) {
  const id = useId()
  const chess = useMemo(() => new Chess(fen), [fen])
  const [selected, setSelected] = useState<Square | null>(null)
  const [notation, setNotation] = useState('')
  const [error, setError] = useState('')
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const canMove = interactive && !busy

  const submit = (move: string) => {
    if (!canMove) return
    setError('')
    setSelected(null)
    setNotation('')
    onMove?.(move)
  }

  const attempt = (from: string, to: string): boolean => {
    if (!canMove || !isSquare(from) || !isSquare(to)) return false
    const moves = chess.moves({ verbose: true }).filter((move) => move.from === from && move.to === to)
    const first = moves[0]
    if (!first) {
      setError('That move is not legal. Choose a highlighted destination.')
      return false
    }
    if (moves.some((move) => move.promotion)) {
      setPromotion({ from, to })
      return false
    }
    submit(uci(first))
    return true
  }

  const chooseSquare = (value: string) => {
    if (!canMove || !isSquare(value)) return
    if (selected === value) { setSelected(null); return }
    if (chess.get(value)?.color === chess.turn()) {
      setSelected(value)
      setError('')
      return
    }
    if (selected) attempt(selected, value)
  }

  const styles: Record<string, React.CSSProperties> = {}
  for (const square of highlighted ?? []) styles[square] = { backgroundColor: 'rgba(232, 193, 88, .56)' }
  if (selected && canMove) {
    styles[selected] = { backgroundColor: 'rgba(241, 195, 79, .75)' }
    for (const move of chess.moves({ verbose: true, square: selected })) {
      styles[move.to] = {
        backgroundImage: move.captured
          ? 'radial-gradient(transparent 58%, rgba(26, 55, 48, .35) 60%)'
          : 'radial-gradient(rgba(26, 55, 48, .3) 19%, transparent 21%)',
      }
    }
  }

  return (
    <div className={`board-shell ${busy ? 'is-checking' : ''}`} aria-label={label}>
      <div className="board-frame">
        <Chessboard options={{
          id,
          position: fen,
          boardOrientation: orientation === 'w' ? 'white' : 'black',
          allowDragging: canMove,
          allowDragOffBoard: false,
          allowDrawingArrows: false,
          allowAutoScroll: false,
          animationDurationInMs: 180,
          boardStyle: { borderRadius: '3px' },
          darkSquareStyle: { backgroundColor: '#789587' },
          lightSquareStyle: { backgroundColor: '#edf0e6' },
          darkSquareNotationStyle: { color: '#eef2e8', fontWeight: 600, fontSize: 11 },
          lightSquareNotationStyle: { color: '#4b695d', fontWeight: 600, fontSize: 11 },
          squareStyles: styles,
          canDragPiece: ({ piece }) => canMove && piece.pieceType[0] === chess.turn(),
          onSquareClick: ({ square }) => chooseSquare(square),
          onPieceDrop: ({ sourceSquare, targetSquare }) => targetSquare ? attempt(sourceSquare, targetSquare) : false,
          squareRenderer: ({ square, children }) => {
            const piece = isSquare(square) ? chess.get(square) : undefined
            const description = piece ? `${piece.color === 'w' ? 'White' : 'Black'} ${names[piece.type]}` : 'empty'
            return (
              <div
                className="square-hit"
                data-square={square}
                role={interactive ? 'button' : 'img'}
                tabIndex={canMove ? 0 : -1}
                aria-label={`${square}: ${description}`}
                aria-disabled={interactive ? !canMove : undefined}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    chooseSquare(square)
                  }
                }}
              >{children}</div>
            )
          },
        }} />
        {busy && <div className="board-working"><span className="spinner" /> Checking every defense...</div>}
      </div>
      {interactive && (
        <form className="move-entry" onSubmit={(event) => {
          event.preventDefault()
          if (!canMove) return
          const input = notation.trim()
          const move = chess.moves({ verbose: true }).find((candidate) => (
            uci(candidate) === input.toLowerCase()
            || candidate.san.replace(/[+#]$/, '') === input.replace(/[+#]$/, '')
          ))
          if (!move) { setError('Enter a legal move, such as Nf3 or g1f3. Include the promotion piece when needed.'); return }
          submit(uci(move))
        }}>
          <label className="sr-only" htmlFor={`${id}-move`}>Enter a move</label>
          <input id={`${id}-move`} value={notation} onChange={(event) => setNotation(event.target.value)} placeholder="Or type a move: Nf3, g1f3..." autoComplete="off" spellCheck={false} disabled={busy} aria-describedby={error ? `${id}-error` : undefined} />
          <button type="submit" className="move-submit" aria-label="Play typed move" disabled={!canMove || !notation.trim()}><Icon name="arrow" size={18} /></button>
        </form>
      )}
      {error && <p id={`${id}-error`} role="alert" className="inline-error">{error}</p>}
      {promotion && <PromotionDialog onCancel={() => setPromotion(null)} onChoose={(piece) => {
        submit(`${promotion.from}${promotion.to}${piece}`)
        setPromotion(null)
      }} />}
    </div>
  )
}
