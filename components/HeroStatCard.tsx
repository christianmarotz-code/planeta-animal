import Link from 'next/link'
import { GaugeRing } from '@/components/GaugeRing'

export function HeroStatCard({
  eyebrow,
  value,
  gaugeValue,
  gaugeTone,
  comparacion,
  href,
}: {
  eyebrow: string
  value: string
  gaugeValue: number
  gaugeTone: 'positive' | 'negative'
  comparacion: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="rise group relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-[var(--r-xl)] p-6 text-white no-underline backdrop-blur-xl transition-transform duration-300 hover:-translate-y-1"
      style={{
        background: 'linear-gradient(155deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 45%, #1c1c1f 55%) 100%)',
        boxShadow: '0 24px 60px -20px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(255,255,255,0.12)',
        textShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 40%)' }}
      />
      <div className="relative flex items-start justify-between gap-4">
        <p className="line-clamp-2 min-w-0 flex-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/70">
          {eyebrow}
        </p>
        <GaugeRing value={gaugeValue} tone={gaugeTone} size={80} />
      </div>
      <div className="relative min-w-0">
        <p className="mono truncate text-[clamp(20px,4vw,32px)] font-medium leading-none" title={value}>
          {value}
        </p>
        <p className="mt-2 truncate text-[13px] text-white/70">{comparacion}</p>
      </div>
    </Link>
  )
}
