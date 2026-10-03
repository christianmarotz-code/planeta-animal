'use client'

import { useState } from 'react'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { REPOSICION_DRAFT_KEY } from '@/lib/data/reposicion'
import { CargaInteligente } from './CargaInteligente'
import { FormularioManual } from './FormularioManual'

type Modo = 'inteligente' | 'manual'

export default function NuevaFacturaPage() {
  const esAdmin = useEsAdministrador()
  // Reposición deja un borrador para el formulario manual: si hay uno, arrancamos ahí.
  const [modo, setModo] = useState<Modo>(() =>
    typeof window !== 'undefined' && sessionStorage.getItem(REPOSICION_DRAFT_KEY) ? 'manual' : 'inteligente'
  )

  if (esAdmin === null) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>
  if (esAdmin === false) {
    return <p className="p-8 text-sm text-negative">Acceso restringido — contactá a un administrador.</p>
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Gestión</p>
        <h1 className="mt-1 text-[27px] text-ink">Nueva factura de compra</h1>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setModo('inteligente')} className={`pill-btn ${modo === 'inteligente' ? '' : 'ghost'}`}>
          Lectura inteligente
        </button>
        <button type="button" onClick={() => setModo('manual')} className={`pill-btn ${modo === 'manual' ? '' : 'ghost'}`}>
          Carga manual
        </button>
      </div>
      {modo === 'inteligente' ? <CargaInteligente /> : <FormularioManual />}
    </div>
  )
}
