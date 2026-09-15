'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { Avatar } from '@/components/Avatar'
import { obtenerOCrearPerfilActual } from '@/lib/data/perfiles'
import type { Perfil } from '@/types/database'

function IconInicio() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 9.5 10 3l7 6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 8.5V17h10V8.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconProveedores() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 7.5 10 3l7 4.5-7 4.5-7-4.5Z" strokeLinejoin="round" />
      <path d="M3 12.5 10 17l7-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconProductos() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="6" width="13" height="10.5" rx="1.5" />
      <path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3h3A1.5 1.5 0 0 1 13 4.5V6" strokeLinecap="round" />
    </svg>
  )
}
function IconCompras() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 4h1.5l1.3 9.2A1.5 1.5 0 0 0 8.3 14.5h6.4a1.5 1.5 0 0 0 1.5-1.2L17.5 7H6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.5" cy="17" r="1" />
      <circle cx="14.5" cy="17" r="1" />
    </svg>
  )
}
function IconStock() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <path d="M3.5 6.5 10 3l6.5 3.5v7L10 17l-6.5-3.5v-7Z" strokeLinejoin="round" />
      <path d="M3.5 6.5 10 10l6.5-3.5M10 10v7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconVentas() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8" cy="16" r="1" />
      <circle cx="14" cy="16" r="1" />
      <path d="M2.5 3.5h2l1.6 9.4a1.5 1.5 0 0 0 1.5 1.3h6.6a1.5 1.5 0 0 0 1.5-1.2l1.3-6.5H5.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconServicios() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 3v3M10 14v3M3 10h3M14 10h3" strokeLinecap="round" />
      <circle cx="10" cy="10" r="3.2" />
    </svg>
  )
}
function IconComparador() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 3v14M14 3v14" strokeLinecap="round" />
      <path d="M3.5 6h5M11.5 14h5" strokeLinecap="round" />
    </svg>
  )
}
function IconReposicion() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <path d="M3.5 6.5 10 3l6.5 3.5v4a6.5 6.5 0 0 1-.3 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 6.5 10 10l6.5-3.5M10 10v7l-6.5-3.5v-7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 12.5h4M16.5 10.5v4" strokeLinecap="round" />
    </svg>
  )
}
function IconGastos() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5v7M12.2 8.2c0-.9-1-1.6-2.2-1.6s-2.2.6-2.2 1.5c0 2.1 4.4 1 4.4 3 0 .9-1 1.5-2.2 1.5s-2.2-.7-2.2-1.6" strokeLinecap="round" />
    </svg>
  )
}
function IconReportes() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <path d="M4.5 16.5V9M10 16.5V3.5M15.5 16.5v-6" strokeLinecap="round" />
    </svg>
  )
}
function IconUsuarios() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7.5" cy="7" r="2.5" />
      <path d="M2.8 16c.6-2.6 2.4-4 4.7-4s4.1 1.4 4.7 4" strokeLinecap="round" />
      <circle cx="14" cy="6.5" r="2" />
      <path d="M12.7 8.7c1.9.2 3.3 1.5 3.8 3.6" strokeLinecap="round" />
    </svg>
  )
}

const GRUPOS = [
  {
    titulo: 'General',
    links: [
      { href: '/', label: 'Inicio', Icono: IconInicio },
      { href: '/proveedores', label: 'Proveedores', Icono: IconProveedores },
      { href: '/productos', label: 'Productos', Icono: IconProductos },
      { href: '/servicios', label: 'Servicios', Icono: IconServicios },
    ],
  },
  {
    titulo: 'Operación',
    links: [
      { href: '/compras', label: 'Compras', Icono: IconCompras },
      { href: '/ventas', label: 'Ventas', Icono: IconVentas },
      { href: '/stock', label: 'Stock', Icono: IconStock },
      { href: '/comparador', label: 'Comparador', Icono: IconComparador, soloAdmin: true },
      { href: '/reposicion', label: 'Reposición', Icono: IconReposicion, soloAdmin: true },
    ],
  },
  {
    titulo: 'Administración',
    soloAdmin: true,
    links: [
      { href: '/gastos', label: 'Gastos', Icono: IconGastos, soloAdmin: true },
      { href: '/reportes', label: 'Reportes', Icono: IconReportes, soloAdmin: true },
      { href: '/usuarios', label: 'Usuarios', Icono: IconUsuarios, soloAdmin: true },
    ],
  },
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
      {GRUPOS.map((grupo) => {
        const links = grupo.links.filter((link) => !link.soloAdmin || esAdmin)
        if (links.length === 0) return null
        return (
          <div key={grupo.titulo} className="flex flex-col gap-1">
            <p className="px-3.5 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/35">
              {grupo.titulo}
            </p>
            {links.map((link) => {
              const activo = pathname === link.href
              const Icono = link.Icono
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-all duration-300 ${
                    activo
                      ? 'bg-accent text-accent-ink shadow-[var(--shadow-inset)]'
                      : 'text-white/75 hover:bg-white/5 hover:text-white hover:shadow-[var(--shadow-inset-dark)]'
                  }`}
                >
                  <Icono />
                  {link.label}
                </Link>
              )
            })}
          </div>
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
        className="flex items-center gap-2.5 rounded-full px-2.5 py-2 text-[13.5px] font-medium text-white/75 transition-all duration-300 hover:bg-white/5 hover:text-white hover:shadow-[var(--shadow-inset-dark)]"
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
          className="w-full rounded-full px-3.5 py-2 text-left text-[13.5px] font-medium text-white/50 transition-all duration-300 hover:bg-white/5 hover:text-white hover:shadow-[var(--shadow-inset-dark)]"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  )
}

function BotonVolver() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="group inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[13px] font-medium text-white/70 backdrop-blur-xl transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
    >
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
        <path d="M12.5 4.5 6 10l6.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Volver
    </button>
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
    <div className="app-bg dashboard-shell min-h-screen md:flex">
      {/* Sidebar desktop: tarjeta flotante, separada de los bordes */}
      <div className="hidden shrink-0 md:block md:p-4">
        <aside className="sticky top-4 flex h-[calc(100vh-2rem)] w-60 flex-col gap-1 rounded-[28px] bg-[#1c1c1f] p-4 text-white shadow-[0_30px_70px_-30px_rgba(0,0,0,0.55),0_2px_8px_rgba(0,0,0,0.18)]">
          <div className="mb-4 flex flex-col items-center gap-1.5">
            <Link href="/" className="flex items-center justify-center transition-transform duration-300 hover:scale-[1.05]">
              <Logo className="h-16 w-auto" />
            </Link>
            <span className="text-[10.5px] text-white/50">Panel de gestión</span>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
            <NavLinks pathname={pathname} esAdmin={esAdmin} />
          </nav>
          <PerfilYSalir perfil={perfil} />
        </aside>
      </div>

      <div className="flex-1">
        {/* Barra superior mobile: logo + hamburguesa */}
        <div className="sticky top-0 z-20 flex items-center justify-end border-b border-white/10 bg-[#1c1c1f]/70 px-4 py-3 text-white backdrop-blur-xl md:hidden">
          <Link href="/" className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center">
            <Logo className="h-11 w-auto" />
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
          className={`fixed inset-y-0 left-0 z-20 flex w-60 flex-col gap-1 bg-[#1c1c1f] p-4 text-white transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden ${
            menuAbierto ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Link
            href="/"
            className="mb-4 flex items-center justify-center"
            onClick={() => setMenuAbierto(false)}
          >
            <Logo className="h-14 w-auto" />
          </Link>
          <nav className="flex flex-1 flex-col gap-1">
            <NavLinks pathname={pathname} esAdmin={esAdmin} onNavigate={() => setMenuAbierto(false)} />
          </nav>
          <PerfilYSalir perfil={perfil} onNavigate={() => setMenuAbierto(false)} />
        </aside>

        {pathname !== '/' && (
          <div className="mx-auto max-w-6xl px-5 pt-5 sm:px-8 sm:pt-8">
            <BotonVolver />
          </div>
        )}

        <main>{children}</main>
      </div>
    </div>
  )
}
