export function GaugeRing({
  value,
  tone = 'accent',
  size = 96,
  label,
}: {
  value: number
  tone?: 'accent' | 'positive' | 'negative'
  size?: number
  label?: string
}) {
  const clamped = Math.max(0, Math.min(100, value))
  const radius = 40
  const circumference = Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  const strokeColor = `var(--${tone})`

  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size / 2 + 8 }}>
      <svg viewBox="0 0 100 55" width={size} height={size / 2 + 8} className="overflow-visible">
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke={strokeColor}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset var(--dur-slow) var(--ease)' }}
        />
      </svg>
      <div className="absolute bottom-0 flex flex-col items-center leading-none text-white">
        <span className="mono text-lg font-semibold">{Math.round(clamped)}%</span>
        {label && <span className="mt-0.5 text-[10px] opacity-70">{label}</span>}
      </div>
    </div>
  )
}
