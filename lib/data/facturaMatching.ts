import type { Proveedor, Producto } from '@/types/database'
import { normalizarTexto } from '@/lib/text/normalizar'

export function emparejarProveedor(
  detectado: { nombre: string | null; cuit: string | null },
  proveedores: Proveedor[]
): Proveedor | null {
  if (detectado.cuit) {
    const cuitNormalizado = detectado.cuit.replace(/\D/g, '')
    const porCuit = proveedores.find((p) => p.cuit && p.cuit.replace(/\D/g, '') === cuitNormalizado)
    if (porCuit) return porCuit
  }

  if (detectado.nombre) {
    const nombreNormalizado = normalizarTexto(detectado.nombre)
    const porNombreExacto = proveedores.find((p) => normalizarTexto(p.nombre) === nombreNormalizado)
    if (porNombreExacto) return porNombreExacto

    const porNombreParcial = proveedores.find((p) => {
      const nombreProveedor = normalizarTexto(p.nombre)
      return nombreProveedor.includes(nombreNormalizado) || nombreNormalizado.includes(nombreProveedor)
    })
    if (porNombreParcial) return porNombreParcial
  }

  return null
}

export function emparejarProducto(nombreDetectado: string | null, productos: Producto[]): Producto | null {
  if (!nombreDetectado) return null
  const nombreNormalizado = normalizarTexto(nombreDetectado)
  if (!nombreNormalizado) return null

  const exacto = productos.find((p) => normalizarTexto(p.nombre) === nombreNormalizado)
  if (exacto) return exacto

  const parcial = productos.find((p) => {
    const nombreProducto = normalizarTexto(p.nombre)
    return nombreProducto.includes(nombreNormalizado) || nombreNormalizado.includes(nombreProducto)
  })
  return parcial ?? null
}
