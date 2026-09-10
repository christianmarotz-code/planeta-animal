'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { Avatar } from '@/components/Avatar'
import { obtenerOCrearPerfilActual } from '@/lib/data/perfiles'
import type { Perfil } from '@/types/database'

const LINKS = [
  { href: '/', label: 'Inicio' },
  { href: '/proveedores', label: 'Proveedores' },
  { href: '/productos', label: 'Productos' },
  { href: '/compras', label: 'Compras' },
  { href: '/stock', label: 'Stock' },
  { href: '/comparador', label: 'Comparador', soloAdmin: true },
  { href: '/gastos', label: 'Gastos', soloAdmin: true },
  { href: '/reportes', label: 'Reportes', soloAdmin: true },
  { href: '/usuarios', label: 'Usuarios', soloAdmin: true },
]

function NavLinks({
  pathname,
  esAdmin,
  onNavigate,
}: {
  pathname: string
  esAdmin: boolean
  onNavigate?: () => void
}) {
  return (
    <>
      {LINKS.filter((link) => !link.soloAdmin || esAdmin).map((link) => {
        const activo = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors duration-300 ${
              activo ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </>
  )
}

function PerfilYSalir({ perfil, onNavigate }: { perfil: Perfil | null; onNavigate?: () => void }) {
  return (
    <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-3">
      <Link
        href="/perfil"
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-full px-2.5 py-2 text-[13.5px] font-medium text-white/75 transition-colors duration-300 hover:bg-white/10 hover:text-white"
      >
        <Avatar nombre={perfil?.nombre ?? ''} avatarUrl={perfil?.avatar_url ?? null} size="sm" />
        <span className="flex flex-col leading-tight">
          <span className="text-white">{perfil?.nombre ?? '...'}</span>
          <span className="text-[11px] text-white/50">Mi perfil</span>
        </span>
      </Link>
      <form action="/api/auth/signout" method="post">
        <button
          type="submit"
          className="w-full rounded-full px-3.5 py-2 text-left text-[13.5px] font-medium text-white/50 transition-colors duration-300 hover:bg-white/10 hover:text-white"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  )
}

export function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const esAdmin = perfil?.rol === 'administrador'

  useEffect(() => {
    obtenerOCrearPerfilActual()
      .then(setPerfil)
      .catch((err) => console.error('No se pudo cargar el perfil', err))
  }, [])

  return (
    <div className="min-h-screen bg-page md:flex">
      {/* Sidebar desktop: fija a la izquierda, ancho 240px (w-60) */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-col gap-1 bg-accent-ink p-4 text-white md:flex">
        <Link href="/" className="mb-4 flex items-center pl-1">
          <Logo />
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          <NavLinks pathname={pathname} esAdmin={esAdmin} />
        </nav>
        <PerfilYSalir perfil={perfil} />
      </aside>

      <div className="flex-1">
        {/* Barra superior mobile: logo + hamburguesa */}
        <div className="sticky top-0 z-20 flex items-center justify-between bg-accent-ink px-4 py-3 text-white md:hidden">
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>
          <button
            type="button"
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMenuAbierto((v) => !v)}
            className="relative flex h-8 w-8 items-center justify-center"
          >
            <span
              className={`absolute h-[2px] w-5 bg-white transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                menuAbierto ? 'rotate-45' : '-translate-y-1.5'
              }`}
            />
            <span
              className={`absolute h-[2px] w-5 bg-white transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                menuAbierto ? '-rotate-45' : 'translate-y-1.5'
              }`}
            />
          </button>
        </div>

        {/* Backdrop mobile: toca para cerrar */}
        {menuAbierto && (
          <div
            className="fixed inset-0 z-10 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setMenuAbierto(false)}
          />
        )}

        {/* Panel deslizante mobile */}
        <aside
          inert={!menuAbierto}
          className={`fixed inset-y-0 left-0 z-20 flex w-60 flex-col gap-1 bg-accent-ink p-4 text-white transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden ${
            menuAbierto ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Link href="/" className="mb-4 flex items-center pl-1" onClick={() => setMenuAbierto(false)}>
            <Logo />
          </Link>
          <nav className="flex flex-1 flex-col gap-1">
            <NavLinks pathname={pathname} esAdmin={esAdmin} onNavigate={() => setMenuAbierto(false)} />
          </nav>
          <PerfilYSalir perfil={perfil} onNavigate={() => setMenuAbierto(false)} />
        </aside>

        <main>{children}</main>
      </div>
    </div>
  )
}
