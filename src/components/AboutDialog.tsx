import { useEffect, useId, useRef } from 'react'
import { Icon } from './Icon'

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useId()
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const enginePath = `${import.meta.env.BASE_URL}stockfish/`
  return (
    <dialog ref={dialog} className="about-dialog" onCancel={onClose} aria-labelledby={title}>
      <div className="dialog-heading"><span className="brand-mark"><Icon name="knight" size={26} /></span><button className="icon-button" aria-label="Close about dialog" onClick={onClose}><Icon name="close" /></button></div>
      <h2 id={title}>A little more counterplay.</h2>
      <p>Good chess does not need identical ratings. Counterplay gives you a practical starting handicap and fresh tactical challenges to meet over the board.</p>
      <h3>Honest about the odds</h3>
      <p>Material recommendations are an adjustable, uncalibrated heuristic. Elo expected score is not a material-odds calculator. Use the same rating pool and time control, and adjust after actual games.</p>
      <h3>Fresh positions, bounded promises</h3>
      <p>Puzzles begin with newly generated legal play. Stockfish searches for candidates; a separate exhaustive verifier checks the concrete objective against legal replies. Search-budget exhaustion is a failure to verify, never a successful puzzle.</p>
      <p>Mate avoidance and material gains are guaranteed only within the stated horizon. They are not claims of a draw or eventual victory. Solving accepts alternative valid later moves.</p>
      <h3>Private by design</h3>
      <p>No accounts, analytics, or chess API calls. Ratings, a maximum of six recent puzzles, and repeat-avoidance history stay in this browser. The engine is downloaded from the same host and runs on your device.</p>
      <h3>Third-party software</h3>
      <ul className="license-list">
        <li><a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">Stockfish.js 19</a> by Nathan Rugg, Chess.com, and Stockfish contributors. Unmodified lite single-threaded engine, GPLv3. <a href={`${enginePath}COPYING.txt`}>License</a>, <a href={`${enginePath}SOURCE.txt`}>build information</a>, <a href={`${enginePath}stockfish-source-54fde71d90c7c403964f6cacef48f7bbec495df1.tar.gz`} download>matching source archive</a>, and <a href={`${enginePath}nn-61e7af4bb97d.nnue`} download>evaluation network</a>.</li>
        <li><a href="https://github.com/jhlywa/chess.js" target="_blank" rel="noreferrer">chess.js</a> by Jeff Hlywa and contributors, BSD-2-Clause.</li>
        <li><a href="https://github.com/Clariity/react-chessboard" target="_blank" rel="noreferrer">react-chessboard</a> by Ryan Gregory and contributors, MIT.</li>
        <li>React by Meta and contributors, MIT. Zod by Colin McDonnell and contributors, MIT. <a href={`${import.meta.env.BASE_URL}THIRD-PARTY-NOTICES.txt`}>Full notices</a>.</li>
      </ul>
      <button className="button primary" onClick={onClose}>Back to the board <Icon name="arrow" size={17} /></button>
    </dialog>
  )
}
