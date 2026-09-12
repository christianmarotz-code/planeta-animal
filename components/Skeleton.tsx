function Bloque({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[var(--r-sm)] bg-white/8 ${className}`} />
}

export function SkeletonStatCards({ cantidad = 3 }: { cantidad?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
      {Array.from({ length: cantidad }).map((_, i) => (
        <div key={i} className="glass-shell rise">
          <div className="glass-core flex h-full flex-col justify-between gap-4">
            <Bloque className="h-3 w-2/3" />
            <Bloque className="h-7 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonList({ filas = 6 }: { filas?: number }) {
  return (
    <div className="card rise divide-y divide-line">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-5 py-3.5">
          <Bloque className="h-4 w-1/3" />
          <Bloque className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ filas = 8, columnas = 3 }: { filas?: number; columnas?: number }) {
  return (
    <div className="card rise overflow-hidden">
      <div className="flex items-center gap-6 border-b-2 border-line-strong px-5 py-3">
        {Array.from({ length: columnas }).map((_, i) => (
          <Bloque key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 border-b border-line px-5 py-3 last:border-0">
          {Array.from({ length: columnas }).map((_, j) => (
            <Bloque key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex flex-col gap-2">
        <Bloque className="h-3 w-24" />
        <Bloque className="h-7 w-48" />
      </div>
      {children}
    </div>
  )
}
