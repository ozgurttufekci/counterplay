import type { Chess, Move } from 'chess.js'
import { material, uci, VALUES } from '../../chess/rules'
import type { Objective } from '../../chess/types'

export type ProofStatus = 'proven' | 'disproven' | 'unknown'
export interface Proof {
  status: ProofStatus
  line: string[]
  value: number
}
export interface RootProof {
  status: ProofStatus
  solutions: { move: string; proof: Proof }[]
  rejected: string[]
  nodes: number
}

export class SearchBudget {
  nodes = 0
  constructor(readonly limit: number, readonly deadline = Infinity) {}
  tick(): boolean {
    this.nodes += 1
    return this.nodes <= this.limit && (this.nodes % 128 !== 0 || performance.now() < this.deadline)
  }
}

const unknown = (): Proof => ({ status: 'unknown', line: [], value: 0 })

function ordered(chess: Chess): Move[] {
  const priority = (move: Move) => (
    (move.san.includes('#') ? 10_000 : move.san.includes('+') ? 500 : 0)
    + (move.captured ? VALUES[move.captured] * 100 - VALUES[move.piece] : 0)
    + (move.promotion ? VALUES[move.promotion] * 100 : 0)
  )
  return chess.moves({ verbose: true }).sort((a, b) => priority(b) - priority(a))
}

function terminal(chess: Chess, objective: Objective, remaining: number): Proof | null {
  const gain = objective.theme === 'material' ? material(chess, objective.solver) - objective.baseline : 0
  if (chess.isCheckmate()) {
    const won = chess.turn() !== objective.solver
    const success = won && (objective.theme !== 'material' || gain >= objective.target)
    return { status: success ? 'proven' : 'disproven', line: [], value: won ? 1000 : -1000 }
  }
  if (chess.isDraw()) {
    return { status: objective.theme === 'defend' ? 'proven' : 'disproven', line: [], value: 0 }
  }
  if (remaining <= 0) {
    const success = objective.theme === 'defend' || (objective.theme === 'material' && gain >= objective.target)
    return { status: success ? 'proven' : 'disproven', line: [], value: gain }
  }
  return null
}

export function prove(chess: Chess, objective: Objective, remaining: number, budget: SearchBudget): Proof {
  if (!budget.tick()) return unknown()
  const end = terminal(chess, objective, remaining)
  if (end) return end
  const maximizing = chess.turn() === objective.solver
  let unresolved = false
  let representative: Proof | null = null
  for (const move of ordered(chess)) {
    chess.move(move)
    const child = prove(chess, objective, remaining - 1, budget)
    chess.undo()
    if (child.status === 'unknown') {
      unresolved = true
      if (budget.nodes > budget.limit || performance.now() >= budget.deadline) return unknown()
      continue
    }
    const branch = { ...child, line: [uci(move), ...child.line] }
    if (maximizing && child.status === 'proven') return branch
    if (!maximizing && child.status === 'disproven') return branch
    if (!representative
      || (objective.theme === 'material' && branch.value < representative.value)
      || (objective.theme !== 'material' && branch.line.length > representative.line.length)) {
      representative = branch
    }
  }
  return unresolved ? unknown() : representative ?? unknown()
}

export function verifyRoot(
  chess: Chess,
  objective: Objective,
  budget: SearchBudget,
  stopAfterAmbiguity = true,
): RootProof {
  if (chess.turn() !== objective.solver || chess.isGameOver()) {
    return { status: 'disproven', solutions: [], rejected: [], nodes: 0 }
  }
  const before = budget.nodes
  const solutions: RootProof['solutions'] = []
  const rejected: string[] = []
  for (const move of ordered(chess)) {
    chess.move(move)
    const proof = prove(chess, objective, objective.plies - 1, budget)
    chess.undo()
    if (proof.status === 'unknown') {
      return { status: 'unknown', solutions, rejected, nodes: budget.nodes - before }
    }
    if (proof.status === 'proven') {
      solutions.push({ move: uci(move), proof: { ...proof, line: [uci(move), ...proof.line] } })
      if (stopAfterAmbiguity && solutions.length > 1) {
        return { status: 'disproven', solutions, rejected, nodes: budget.nodes - before }
      }
    } else {
      rejected.push(uci(move))
    }
  }
  return {
    status: solutions.length === 1 ? 'proven' : 'disproven',
    solutions,
    rejected,
    nodes: budget.nodes - before,
  }
}

export function reachedObjective(chess: Chess, objective: Objective, playedPlies: number): boolean {
  return terminal(chess, objective, objective.plies - playedPlies)?.status === 'proven'
}
