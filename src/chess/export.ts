export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/x-chess-pgn;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
