export const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const INPUT =
  'rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none transition focus:border-accent'

export const TH = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint'

export const aNumero = (v: string): number | null =>
  v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v)
