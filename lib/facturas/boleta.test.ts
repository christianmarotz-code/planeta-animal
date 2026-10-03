import { describe, it, expect } from 'vitest'
import { sanearBoletaExtraida } from './boletaExtraida'
import { procesarBoleta } from './procesarBoleta'
import { cuitValido, caeValido, numeroComprobanteValido, validarBoleta } from './validacionesBoleta'

// Caso B (Nestlé 0395-00926082) tal como lo devolvería el extractor.
const crudoCasoB = {
  tipo: 'factura_A',
  proveedor_nombre: 'Nestlé Argentina S.A.',
  proveedor_cuit: '30-54676404-0',
  comprador_cuit: '20-11111111-2',
  numero_comprobante: '0395-00926082',
  fecha: '2026-09-23',
  cae: '12345678901234',
  proveedor_coincide: true,
  lineas: [
    {
      codigo: '12570724',
      descripcion: 'Excellent Gatito 6x1kg',
      descripcion_normalizada: '  Excellent  Gatito 6 x 1 kg ',
      cantidad: 12,
      precio_lista: 9311.25,
      bonificaciones: [{ porcentaje: 14, monto: null }],
      importe: 93209.42,
      es_regalo: false,
    },
  ],
  subtotal: 93209.42,
  percepciones: [
    { nombre: 'IIBB 4%', alicuota: 4, monto: 3728.38 },
    { nombre: 'Perc. IVA 3%', alicuota: 3, monto: 2796.28 },
  ],
  iva: [{ alicuota: 21, monto: 19573.98 }],
  total: 119308.06,
}

const ctx = {
  proveedorDeclarado: { nombre: 'Nestlé Argentina S.A.', cuit: '30-54676404-0' },
  compradorCuit: '20-11111111-2',
  hoy: new Date('2026-10-01'),
}

describe('sanearBoletaExtraida', () => {
  it('deriva es_fiscal del tipo y no del modelo', () => {
    const b = sanearBoletaExtraida({ ...crudoCasoB, tipo: 'presupuesto_X', es_fiscal: true })
    expect(b.es_fiscal).toBe(false)
    expect(sanearBoletaExtraida(crudoCasoB).es_fiscal).toBe(true)
  })
  it('descarta campos inválidos sin romper el resto', () => {
    const b = sanearBoletaExtraida({
      ...crudoCasoB,
      fecha: '23/09/2026',
      total: 'mucho',
      lineas: [{ descripcion: '' }, { descripcion: 'X', cantidad: '3', es_regalo: true }],
    })
    expect(b.fecha).toBeNull()
    expect(b.total).toBeNull()
    expect(b.lineas).toHaveLength(1)
    expect(b.lineas[0].cantidad).toBeNull()
    expect(b.lineas[0].es_regalo).toBe(true)
  })
  it('tolera basura total', () => {
    expect(sanearBoletaExtraida(null).lineas).toEqual([])
    expect(sanearBoletaExtraida('x').tipo).toBeNull()
  })
})

describe('procesarBoleta + validarBoleta — Caso B', () => {
  const boleta = sanearBoletaExtraida(crudoCasoB)
  const procesada = procesarBoleta(boleta)

  it('arma la fila de 4 columnas con el precio final unitario 9.942,34', () => {
    expect(procesada.filas).toHaveLength(1)
    expect(procesada.filas[0].producto).toBe('Excellent Gatito 6 x 1 kg')
    expect(procesada.filas[0].cantidad).toBe(12)
    expect(procesada.filas[0].precioUnitarioFinal).toBeCloseTo(9942.34, 2)
    expect(procesada.totalAPagar).toBe(119308.06)
  })
  it('sin alertas y estado ok', () => {
    const { alertas, estado } = validarBoleta(boleta, procesada, ctx)
    expect(alertas).toEqual([])
    expect(estado).toBe('ok')
  })
  it('proveedor distinto es bloqueante (Caso G)', () => {
    const { alertas } = validarBoleta(boleta, procesada, {
      ...ctx,
      proveedorDeclarado: { nombre: 'Vitalcan', cuit: '30-71111111-1' },
    })
    expect(alertas.find((a) => a.codigo === 'proveedor_distinto')?.nivel).toBe('bloqueante')
  })
  it('proveedor_coincide=false del modelo también bloquea', () => {
    const b = sanearBoletaExtraida({ ...crudoCasoB, proveedor_coincide: false })
    const { alertas } = validarBoleta(b, procesarBoleta(b), {
      ...ctx,
      proveedorDeclarado: { nombre: 'Vitalcan', cuit: null },
    })
    expect(alertas.some((a) => a.codigo === 'proveedor_distinto')).toBe(true)
  })
  it('total que no cuadra pasa a revisión', () => {
    const b = sanearBoletaExtraida({ ...crudoCasoB, total: 120000 })
    const { alertas, estado } = validarBoleta(b, procesarBoleta(b), ctx)
    expect(alertas.some((a) => a.codigo === 'no_cuadra')).toBe(true)
    expect(estado).toBe('revision')
  })
  it('un documento que no es compra se bloquea', () => {
    const b = sanearBoletaExtraida({ tipo: 'otro_no_compra', descripcion_no_compra: 'Formulario', lineas: [] })
    const { alertas } = validarBoleta(b, procesarBoleta(b), ctx)
    expect(alertas[0]).toMatchObject({ codigo: 'no_es_compra', nivel: 'bloqueante' })
  })
})

describe('validadores de formato', () => {
  it('CUIT con dígito verificador', () => {
    expect(cuitValido('30-54676404-0')).toBe(true)
    expect(cuitValido('30-54676404-1')).toBe(false)
    expect(cuitValido('123')).toBe(false)
  })
  it('CAE de 14 dígitos', () => {
    expect(caeValido('12345678901234')).toBe(true)
    expect(caeValido('1234')).toBe(false)
  })
  it('número de comprobante de 4 o 5 dígitos de punto de venta', () => {
    expect(numeroComprobanteValido('0395-00926082')).toBe(true)
    expect(numeroComprobanteValido('00003-00015966')).toBe(true)
    expect(numeroComprobanteValido('395-926082')).toBe(false)
  })
})
