import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = new URL('../', import.meta.url)
const destination = new URL('public/stockfish/', root)
const sourceCommit = '54fde71d90c7c403964f6cacef48f7bbec495df1'
const sourceUrl = `https://codeload.github.com/nmrugg/stockfish.js/tar.gz/${sourceCommit}`
const packageJson = JSON.parse(await readFile(new URL('node_modules/stockfish/package.json', root), 'utf8'))
if (packageJson.version !== '19.0.0') {
  throw new Error('Update the pinned engine assets and corresponding source before changing Stockfish versions.')
}
await mkdir(destination, { recursive: true })
for (const filename of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  await copyFile(new URL(`node_modules/stockfish/bin/${filename}`, root), new URL(filename, destination))
}
await copyFile(new URL('node_modules/stockfish/Copying.txt', root), new URL('COPYING.txt', destination))

const archive = new URL(`stockfish-source-${sourceCommit}.tar.gz`, destination)
try {
  await stat(archive)
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
  console.log('Downloading matching Stockfish source and build scripts for redistribution...')
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`Stockfish source download failed: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('Stockfish source response was not a gzip archive.')
  await writeFile(archive, bytes)
}
const networkName = 'nn-61e7af4bb97d.nnue'
const networkFile = new URL(networkName, destination)
try {
  await stat(networkFile)
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
  console.log('Downloading the matching lite evaluation network for the source distribution...')
  const response = await fetch(`https://tests.stockfishchess.org/api/nn/${networkName}`, {
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`Stockfish network download failed: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!createHash('sha256').update(bytes).digest('hex').startsWith('61e7af4bb97d')) {
    throw new Error('The Stockfish evaluation network failed its upstream content-hash check.')
  }
  await writeFile(networkFile, bytes)
}
if (!createHash('sha256').update(await readFile(networkFile)).digest('hex').startsWith('61e7af4bb97d')) {
  throw new Error('The cached Stockfish evaluation network is corrupt. Remove it and run prepare:engine again.')
}
const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex')
await writeFile(new URL('SOURCE.txt', destination), [
  'Stockfish.js 19.0.0, unmodified lite single-threaded WebAssembly build.',
  'Copyright Stockfish contributors, Nathan Rugg, and Chess.com. GPLv3.',
  `Source revision: ${sourceCommit}`,
  `Upstream: ${sourceUrl}`,
  `Corresponding source and build scripts: ${fileURLToPath(archive).split('/').at(-1)}`,
  `Source archive SHA-256: ${sha256}`,
  `Matching evaluation network: ${networkName} (also embedded in the distributed WASM).`,
  `To rebuild, extract the archive, copy ${networkName} into its src/ directory, install the documented Emscripten toolchain,`,
  'then run node build.js --lite --single-threaded --no-split. See the upstream README and build.js for all prerequisites.',
  'See COPYING.txt and the application Third-party software page.',
  '',
].join('\n'))
console.log('Stockfish 19 lite assets, license, and matching source are ready.')

const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'))
const notices = ['COUNTERPLAY - THIRD-PARTY SOFTWARE NOTICES', 'The following notices cover the production dependencies bundled with this app.', '']
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/') || info.dev || info.devOptional) continue
  const directory = new URL(`${path}/`, root)
  const metadata = JSON.parse(await readFile(new URL('package.json', directory), 'utf8'))
  const licenses = (await readdir(directory)).filter((file) => /^(licen[cs]e|copying)(\..*)?$/i.test(file))
  if (!licenses.length) throw new Error(`Missing redistributable license notice for ${metadata.name}.`)
  notices.push('='.repeat(72), `${metadata.name} ${metadata.version} (${metadata.license})`, '')
  for (const license of licenses) notices.push(await readFile(new URL(license, directory), 'utf8'), '')
}
await writeFile(new URL('public/THIRD-PARTY-NOTICES.txt', root), notices.join('\n'))
console.log('Production dependency license notices are ready.')
