import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Chess } from 'chess.js'
import { ChessBoard } from '../src/components/ChessBoard'
import '../src/styles.css'

function BoardHarness() {
  const [fen, setFen] = useState('6br/5P1k/5K1p/8/8/8/8/8 w - - 0 1')
  const [move, setMove] = useState('')
  return <main style={{ maxWidth: 480, padding: 25 }}>
    <h1>Promotion fixture</h1>
    <ChessBoard fen={fen} interactive label="Promotion test board" onMove={(played) => {
      const chess = new Chess(fen)
      chess.move(played)
      setFen(chess.fen())
      setMove(played)
    }} />
    <output aria-label="Played move">{move}</output>
  </main>
}
const root = document.getElementById('board-test')
if (!root) throw new Error('Missing test mount point')
createRoot(root).render(<BoardHarness />)
