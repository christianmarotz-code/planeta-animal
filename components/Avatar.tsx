export function Avatar({
  nombre,
  avatarUrl,
  size = 'sm',
}: {
  nombre: string
  avatarUrl: string | null
  size?: 'sm' | 'lg'
}) {
  const dimensiones = size === 'lg' ? 'h-24 w-24 text-3xl' : 'h-8 w-8 text-sm'

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt={nombre} className={`${dimensiones} rounded-full object-cover`} />
    )
  }

  const inicial = nombre.trim().charAt(0).toUpperCase() || '?'

  return (
    <div
      className={`${dimensiones} flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-white`}
    >
      {inicial}
    </div>
  )
}
