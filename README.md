# Counterplay

A browser-only chess app for two differently rated players:

- **Balance a Game:** recommend adjustable material odds, preview the position, and export FEN or setup PGN.
- **Puzzle Lab:** generate separate White and Black middlegame challenges for avoiding mate, forcing mate, or winning material.
- Solve using clicks, dragging, keyboard square selection, or typed SAN/UCI moves. Includes promotion choices, automatic opponent replies, hints, reset, and solution replay/export.

There are no accounts, analytics, backend services, rating-platform integrations, or online multiplayer.

## Run locally

Use Node.js 20.19+ or 22.12+ (LTS) and npm.

```sh
npm ci
npm run dev
```

Open the localhost address printed by Vite. The development server binds only to `127.0.0.1`.

Installation prepares the pinned Stockfish 19 lite single-threaded WASM engine, its GPLv3 license, matching source archive, evaluation network, and production dependency notices. The source archive and network are downloaded from upstream over HTTPS during installation, not when a player generates a puzzle.

If install scripts were disabled, run:

```sh
npm run prepare:engine
```

Asset preparation fails explicitly if a required download or network hash check fails. Generated engine/source assets and notices are not checked into the project; the lockfile pins the packages needed to recreate them.

## Build and deploy

```sh
npm run build
npm run preview
```

Deploy **the entire `dist` directory** to a static HTTPS host. Relative asset paths support a non-root directory, such as `/counterplay/`. Serve `.wasm` as `application/wasm`, JavaScript as JavaScript, and retain the `stockfish` source, network, and license files alongside the runtime files. Do not redirect missing worker/WASM requests to HTML.

The app uses a lite single-threaded engine in a worker. It does not require `SharedArrayBuffer`, cross-origin isolation, or COOP/COEP headers. The UI stays responsive while generation and exhaustive verification run off the main thread. The first puzzle needs the approximately 1.8 MB engine download.

If adding a Content Security Policy, allow same-origin scripts, styles, worker and connection requests, and WebAssembly compilation (`'wasm-unsafe-eval'`). The board uses inline style attributes. Test the actual host configuration; do not open the app directly with `file://`.

### Live Vercel demo

**[Open Counterplay](https://counterplay-chess.vercel.app/)** - public production URL, no Vercel login required.

The demo is hosted in the `counterplay-chess` project under the personal `ozgur-tufekcis-projects` Hobby scope. It deploys only the compiled static build using Vercel's **Other** preset; there is no server runtime, cloud rebuild, or Git auto-deployment.

To publish an updated build from this workspace with the authorized Vercel account:

```sh
npm run build
VERCEL_TELEMETRY_DISABLED=1 npx --yes vercel@62.2.0 deploy dist \
  --prod --yes --project counterplay-chess --scope ozgur-tufekcis-projects
```

Deploy `dist`, not the workspace root. The [deployment allowlist](public/.vercelignore) is copied into the build and includes only the HTML, compiled assets, Stockfish runtime/source/network files, and third-party notices. Credentials, local configuration, tests, and development files are excluded. This static app needs no Vercel environment variables.

The October 4, 2026 deployment was checked anonymously: all 11 public files matched the local build's SHA-256 hashes, WASM had the correct MIME type, handicap PGN export round-tripped, and fresh avoid-mate, material-gain, and mate-in-two puzzles were generated and fully solved on the live site without browser errors.

## What the handicap recommendation means

Version 1 uses deliberately transparent **uncalibrated heuristics**, not a conversion from Elo to human material-handicap winning probabilities:

| Rating difference | Suggested odds | Removed from the stronger player |
| --- | --- | --- |
| 0-149 | Even material | Nothing |
| 150-349 | Pawn | f-pawn |
| 350-649 | Bishop | c-file bishop |
| 650-999 | Rook | a-file rook |
| 1000+ | Queen | Queen |

Knight odds (b-file knight) is a manual alternative at the bishop tier. The app warns that differences over 1400 are outside the heuristic's useful confidence range. It does not keep increasing the handicap beyond queen odds or claim a maximum handicap makes the game equal.

Use ratings from the **same platform/rating pool and time control**. The practical value of material also varies with absolute skill. Adjust after actual games; this is not a calibrated rating system.

The lower-rated player defaults to White. Colors can be swapped explicitly; ties default player one to White. Only the stronger side loses material. Removing a rook also removes the corresponding castling right. Both kings, side to move, en-passant state, and move counters are preserved correctly.

Exports include the `SetUp` and `FEN` PGN tags. For broad PGN-reader compatibility, double quotes and backslashes in player names become apostrophes and forward slashes; the UI explicitly reports this normalization when it occurs.

## How fresh puzzles work

1. Record a cryptographically chosen random seed.
2. Generate new legal games from the standard starting position, mixing engine-ranked moves with controlled inaccuracies. There is **no bundled puzzle bank** or fabricated piece placement.
3. Sample positions on full moves 12-35, with at least 12 pieces and four non-pawn/non-king pieces. Keep the full move prefix, including repetition history.
4. Use Stockfish to identify promising tactics.
5. Independently enumerate legal first moves and use bounded adversarial search to check the concrete objective. Publish only when exactly one first move succeeds and every alternative has been resolved.
6. Recheck the actual winning first move with a stronger, restricted-root Stockfish search.

A principal variation, a centipawn gap, or "no mate found" is not treated as proof. Exhaustive results are **proven**, **disproven**, or **unknown**. Budget exhaustion stays unknown and the candidate is rejected.

### Concrete objectives

- **Find the mate:** force checkmate in one or two solver moves against every legal defense. A mate in one is not relabeled as a mate in two to inflate difficulty.
- **Avoid mate:** prevent forced mate over the next one or two opponent moves. Alternatives must allow mate inside that same horizon. This does **not** prove a draw or permanent safety.
- **Win material:** gain at least three net material points within one or two solver moves, including all intervening opponent replies and recaptures. Piece values are pawn 1, bishop/knight 3, rook 5, queen 9. Checkmate and rule draws are handled separately. This is a bounded tactical objective, not a game-winning guarantee.

The solver rechecks user continuations, accepts alternative valid later moves, and does not declare a multi-move puzzle complete after its first move. Grading uses a separate worker queue so solving one card does not wait behind generation for the other.

### Difficulty and search limits

The automatic difficulty is Gentle below rating 1100, Challenging from 1100-1699, and Deep from 1700. Players can override it. These are not measured puzzle Elo ratings.

Candidate difficulty combines verified horizon length, the number of legal choices, the number of forcing distractions, and whether the first move is quiet. The documented score is:

```text
3 * (solver turns - 1)
+ 1 if there are at least 24 legal first moves
+ 1 if at least five first moves are captures or checks
+ 1 if the solution's first move is neither a capture nor a check
```

Scores 0-1 are Gentle, 2-3 Challenging, and 4+ Deep. A defensive position can be used at different horizons, requiring a longer continuation at a higher setting.

Current fixed limits: 140 candidate games, 70 plies per game, 2000 engine nodes per probe, 24000 per confirmation, 45000 exhaustive nodes per candidate, and a 120-second generation deadline. The worker watchdog allows initialization and final-search overhead, up to 155 seconds. Generation can take seconds or approach the limit depending on settings and hardware.

If no qualifying position is found, the app reports failure and offers another search. It never silently changes the theme/difficulty, substitutes a canned puzzle, or weakens verification. Canceling an active search terminates that worker; queued jobs restart with a clean engine.

## Local data and recovery

Preferences, up to six recent puzzles, and up to 50 position keys are stored under `counterplay:v1` in `localStorage`. Stored records are schema/version validated; legal histories and solution lines must replay. Only valid ratings are saved.

Corrupt or unavailable storage produces a visible warning. Existing data is not silently overwritten after a failed load. **Reset local history** clears only Counterplay's key, preserves current player settings, and attempts to enable saving again. The app can still be used without saving.

Recent puzzle positions are restored, but in-progress attempts and a manual handicap adjustment are not persisted. Solution hiding is a learning aid, not a security boundary: the local browser contains the solution data.

## Verification

```sh
npm run lint
npm test
npm run build
npm run test:e2e
npm run qualify
```

If Playwright reports missing browsers, install them with `npx playwright install chromium firefox webkit`, then rerun the browser tests.

- Unit tests cover handicap band boundaries, monotonic severity, swaps/ties, castling and notation, mate/defense/material fixtures for both colors, actual knight underpromotion, recapture traps, draws/repetition, alternative continuations, worker cancellation/queuing, UCI score types/bounds, and storage failures.
- Playwright serves the **production build under `/counterplay/`** and exercises real worker/WASM generation in Chromium, Firefox, and WebKit, plus a mobile touch layout. A separate development-only board harness tests promotion interaction; it is not included in the release build.
- `npm run qualify -- --matrix` checks all 18 theme/color/difficulty combinations.
- `npm run qualify -- --batch` runs ten predetermined seeds per theme/color group, with a required yield of at least eight successful generations in each group.
- Qualification uses a separate reference search implementation to verify unique first moves, legal reachability, and complete solution replay. Fixtures do not count as generation successes. JSON reports go into `test-results/`; browser artifacts use `test-results/browser/` so they do not erase qualification reports.

Do not raise limits or cherry-pick seeds merely to pass qualification. Review and document any generator changes before rerunning the unchanged checks.

### Initial verification baseline

Verified on October 4, 2026, with Node.js 20.20.1 on macOS:

| Check | Result |
| --- | --- |
| TypeScript / production build / ESLint | Passed |
| Unit and regression tests | 63 passed |
| Chromium, Firefox, WebKit, and mobile browser checks | 22 passed |
| Real-engine theme/color/difficulty matrix | 18 of 18 passed |
| Additional fixed-seed generation batch | 60 of 60 passed; every group exceeded the required 8 of 10 |
| Independent reachability, unique first-move, and solution checks | Passed for all 78 generated positions |
| npm dependency audit | No reported advisories at verification time |

These results establish a reproducible initial baseline, not a guarantee of generation latency or future success on every device and seed. Some qualified searches took over a minute.

## Code map

- [Chess rules and notation](src/chess/): shared types, reconstruction, piece values, FEN/PGN helpers.
- [Handicap mode](src/features/handicap/): versioned heuristic and starting-position construction.
- [Engine adapter](src/engine/): typed UCI scores, initialization, serialization, limits, and transport.
- [Puzzle mode](src/features/puzzles/): fresh generation, exhaustive verification, isolated workers, solver, and replay UI.
- [Storage](src/storage.ts): bounded, validated browser persistence.
- [Qualification harness](scripts/qualify.ts): reproducible real-engine generation and independent verification.

## Third-party licensing

Stockfish.js 19.0.0 is distributed unmodified under GPLv3. Asset preparation supplies:

- Its complete license text.
- The source archive for npm's pinned git revision `54fde71d90c7c403964f6cacef48f7bbec495df1`, including build scripts.
- The matching `nn-61e7af4bb97d.nnue` evaluation network, verified against the upstream filename's SHA-256 prefix.
- Rebuild instructions and source archive hash in `stockfish/SOURCE.txt`.
- Full notices for all production dependencies in `THIRD-PARTY-NOTICES.txt`.

The in-app **About & software credits** dialog links to these files. Keep them accessible when redistributing or hosting the build. If modifying or replacing Stockfish, update the exact corresponding source and licensing provisions as well; an upstream homepage link alone is not the source distribution.
