import type { CategoriaGasto } from '@/types/database'

export const NOMBRE_CATEGORIA: Record<CategoriaGasto, string> = {
  combustible: 'Combustible',
  servicios: 'Servicios (luz/gas/agua/internet)',
  indumentaria: 'Indumentaria',
  impuestos: 'Impuestos',
  otro: 'Otro',
}
