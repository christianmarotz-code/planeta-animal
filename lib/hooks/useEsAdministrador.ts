'use client'

import { useEffect, useState } from 'react'
import { obtenerOCrearPerfilActual } from '@/lib/data/perfiles'

export function useEsAdministrador(): boolean | null {
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    obtenerOCrearPerfilActual()
      .then((perfil) => setEsAdmin(perfil.rol === 'administrador'))
      .catch(() => setEsAdmin(false))
  }, [])

  return esAdmin
}
