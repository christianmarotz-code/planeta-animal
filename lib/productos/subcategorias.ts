import type { Rama } from '@/types/database'

export const SIN_CLASIFICAR = 'Sin clasificar'

// Subcategorías asignables a mano, por rama. Coinciden con las etiquetas que
// cargó la migración 0025. Las etiquetas "(mover a servicios)" no están acá a
// propósito: marcan filas pendientes de migrar a `servicios`, no son un destino
// válido para un producto.
export const SUBCATEGORIAS_POR_RAMA: Record<Rama, string[]> = {
  clinica: [
    'Accesorios varios (clínica)',
    'Anestesia, soluciones y antisépticos',
    'Antiparasitario - collares',
    'Antiparasitario - comprimidos, sprays y otros',
    'Antiparasitario - pipetas',
    'Dietético clínico',
    'Emergencia, eutanasia y hematología',
    'Insumos, instrumental y laboratorio',
    'Limpieza y papelería',
    'Medicamento - antibióticos y antimicóticos',
    'Medicamento - antiinflamatorios, analgésicos y antialérgicos',
    'Medicamento - cardiología, renales y articulares',
    'Medicamento - digestivos, urinarios, respiratorios y suplementos',
    'Medicamento - inyectables varios',
    'Neurología, comportamiento y hormonales',
    'Oftálmicos y óticos',
    'Oncología e inmunosupresores',
    'Post-quirúrgico y protección',
    'Tópicos, curabicheras e higiene',
    'Vacunas',
  ],
  petshop: [
    'Acuarios, aves y roedores',
    'Alimento - gato',
    'Alimento - otras mascotas',
    'Alimento - perro',
    'Arena, litera y sanitarios',
    'Camas y descanso',
    'Comederos y bebederos',
    'Higiene petshop - otros',
    'Higiene y cuidado del pelo',
    'Juguetes, mordillos y rascadores',
    'Kits y varios',
    'Paseo (collares, correas, pretales)',
    'Peluquería y grooming',
    'Post-quirúrgico y protección',
    'Ropa',
    'Snacks y premios',
    'Transporte y viaje',
  ],
}

// Opciones a mostrar en el selector: las de la rama, más el valor actual si no
// está en la lista (por ejemplo una etiqueta "(mover a servicios)"), para que
// abrir un producto así no pierda su valor en silencio.
export function opcionesSubcategoria(rama: Rama | '', actual: string): string[] {
  const base = rama ? SUBCATEGORIAS_POR_RAMA[rama] : []
  const extra = actual && actual !== SIN_CLASIFICAR && !base.includes(actual) ? [actual] : []
  return [SIN_CLASIFICAR, ...base, ...extra]
}
