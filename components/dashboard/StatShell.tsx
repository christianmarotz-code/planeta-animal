import Link from 'next/link'

export function StatShell({
  eyebrow,
  value,
  delta,
  href,
  children,
}: {
  eyebrow: string
  value: string
  delta?: { texto: string; positivo: boolean }
  href?: string
  children?: React.ReactNode
}) {
  const contenido = (
    <div className="glass-core flex h-full flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="line-clamp-2 min-w-0 flex-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft transition-colors group-hover:text-accent">
          {eyebrow}
        </p>
        {delta && (
          <span className={`chip chip-on-glass ${delta.positivo ? 'up' : 'down'}`}>
            {delta.positivo ? '↑' : '↓'} {delta.texto}
          </span>
        )}
      </div>
      <p className="mono text-[27px] font-medium leading-none text-ink">{value}</p>
      {children}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="glass-shell group rise block no-underline">
        {contenido}
      </Link>
    )
  }

  return <div className="glass-shell rise">{contenido}</div>
}
