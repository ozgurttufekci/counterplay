export type IconName = 'knight' | 'balance' | 'spark' | 'arrow' | 'swap' | 'copy' | 'download' | 'info' | 'check' | 'close' | 'refresh' | 'eye' | 'shield' | 'chevron'

const paths: Record<IconName, string> = {
  knight: 'M5 20h14M6 17h12l-2-5 2-4-5-6-3 4-4 2v4l4 1 2-3M13 6h.01',
  balance: 'M12 3v17M6 20h12M5 6h14M5 6l-4 8h8L5 6Zm14 0-4 8h8l-4-8ZM1 14c1 4 7 4 8 0m6 0c1 4 7 4 8 0',
  spark: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Zm7-2v4m-2-2h4',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  swap: 'M4 7h16l-4-4M20 17H4l4 4',
  copy: 'M9 9h11v12H9zM15 5V2H3v13h3',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  info: 'M12 16v-5m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  refresh: 'M20 7V2m0 5h-5M4 17v5m0-5h5M20 7a9 9 0 0 0-16 2m0 8a9 9 0 0 0 16-2',
  eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm-4 10 3 3 5-6',
  chevron: 'm9 5 7 7-7 7',
}

export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
