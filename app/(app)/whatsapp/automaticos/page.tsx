'use client'

import { useEffect, useState } from 'react'
import { guardarInterruptor, guardarRegla, obtenerAutomaticos } from '@/lib/data/whatsapp'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import type { ReglaWhatsapp, TipoReglaWhatsapp } from '@/types/database'

const TITULOS: Record<TipoReglaWhatsapp, string> = {
  saludo_inicial: 'Saludo inicial',
  fuera_de_horario: 'Fuera de horario',
}
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function ReglaForm({ regla }: { regla: ReglaWhatsapp }) {
  const [valores, setValores] = useState(regla)
  const [estado, setEstado] = useState<'' | 'guardando' | 'guardado' | 'error'>('')
  const conHorario = regla.tipo === 'fuera_de_horario'

  async function guardar() {
    setEstado('guardando')
    try {
      await guardarRegla(regla.tipo, {
        activa: valores.activa,
        texto: valores.texto,
        abre: conHorario ? valores.abre : null,
        cierra: conHorario ? valores.cierra : null,
        dias: valores.dias,
      })
      setEstado('guardado')
    } catch {
      setEstado('error')
    }
  }

  return (
    <div className="card rise flex flex-col gap-3 p-5">
      <label className="flex items-center justify-between text-sm font-semibold text-ink">
        {TITULOS[regla.tipo]}
        <input
          type="checkbox"
          checked={valores.activa}
          onChange={(e) => setValores({ ...valores, activa: e.target.checked })}
        />
      </label>
      <textarea
        value={valores.texto}
        onChange={(e) => setValores({ ...valores, texto: e.target.value })}
        rows={3}
        maxLength={1000}
        className="rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
      />
      {conHorario && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft">
          <label>
            Abre{' '}
            <input
              type="time"
              value={valores.abre?.slice(0, 5) ?? ''}
              onChange={(e) => setValores({ ...valores, abre: e.target.value || null })}
              className="rounded border border-line bg-surface p-1"
            />
          </label>
          <label>
            Cierra{' '}
            <input
              type="time"
              value={valores.cierra?.slice(0, 5) ?? ''}
              onChange={(e) => setValores({ ...valores, cierra: e.target.value || null })}
              className="rounded border border-line bg-surface p-1"
            />
          </label>
          {DIAS.map((nombre, i) => (
            <label key={nombre} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={valores.dias.includes(i)}
                onChange={(e) =>
                  setValores({
                    ...valores,
                    dias: e.target.checked ? [...valores.dias, i].sort() : valores.dias.filter((d) => d !== i),
                  })
                }
              />
              {nombre}
            </label>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button type="button" onClick={guardar} disabled={estado === 'guardando'} className="pill-btn">
          Guardar
        </button>
        {estado === 'guardado' && <span className="text-xs text-ink-soft">Guardado</span>}
        {estado === 'error' && <span className="text-xs text-negative">No se pudo guardar. Intentá de nuevo.</span>}
      </div>
    </div>
  )
}

export default function AutomaticosPage() {
  const esAdmin = useEsAdministrador()
  const [datos, setDatos] = useState<{ interruptor: boolean; reglas: ReglaWhatsapp[] } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (esAdmin !== true) return
    obtenerAutomaticos().then(setDatos).catch(() => setError(true))
  }, [esAdmin])

  if (esAdmin === null) return null
  if (esAdmin === false) {
    return <p className="p-8 text-sm text-negative">Acceso restringido — contactá a un administrador.</p>
  }
  if (error) return <p className="p-8 text-sm text-negative">No se pudieron cargar las respuestas automáticas.</p>
  if (!datos) return null

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">WhatsApp</p>
        <h1 className="mt-1 text-[27px] text-ink">Respuestas automáticas</h1>
        <p className="mt-2 text-xs text-ink-faint">
          Solo se responde a quien escribe primero, una vez cada 24 horas por regla y nunca a proveedores.
        </p>
      </div>

      <label className="card rise flex items-center justify-between p-5 text-sm font-semibold text-ink">
        Respuestas automáticas activadas
        <input
          type="checkbox"
          defaultChecked={datos.interruptor}
          onChange={(e) => guardarInterruptor(e.target.checked).catch(() => setError(true))}
        />
      </label>

      {datos.reglas.map((regla) => (
        <ReglaForm key={regla.tipo} regla={regla} />
      ))}
    </div>
  )
}
