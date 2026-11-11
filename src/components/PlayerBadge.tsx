import type { Color } from 'chess.js'
import type { Player } from '../chess/types'
import { COLORS } from '../chess/types'

export function PlayerBadge({ player, color, note }: { player: Player; color: Color; note?: string }) {
  return (
    <div className="player-badge">
      <span className={`color-token ${color}`} aria-hidden="true" />
      <span className="player-badge-name">{player.name || `${COLORS[color]} player`}<span>{COLORS[color]}{note ? ` / ${note}` : ''}</span></span>
      <span className="rating-pill">{player.rating}</span>
    </div>
  )
}
