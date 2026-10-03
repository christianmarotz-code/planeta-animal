import { describe, it, expect } from 'vitest'
import { sanearBoletaExtraida } from './boletaExtraida'
import { procesarBoleta } from './procesarBoleta'
import {
  armarPayloadFactura,
  buscarFacturaDuplicada,
  calcularVencimiento,
  completarProveedorDesdeBoleta,
} from './guardarBoleta'
import type { FacturaCompra, Proveedor } from '@/types/database'

// Caso A (Nestlé 0395-00924054), tal como lo devolvería el extractor.
const l = (codigo: string, descripcion: string, cantidad: number, lista: number, bon: number[], importe: number) => ({
  codigo,
  descripcion,
  cantidad,
  precio_lista: lista,
  bonificaciones: bon.map((porcentaje) => ({ porcentaje, monto: null })),
  importe,
  es_regalo: false,
})

const boleta = sanearBoletaExtraida({
  tipo: 'factura_A',
  proveedor_nombre: 'NESTLE ARGENTINA S.A.',
  proveedor_cuit: '30-54676404-0',
  numero_comprobante: '0395-00924054',
  fecha: '2026-09-15',
  condicion_pago: '10 días fecha factura',
  lineas: [
    l('12341823', 'Pro Plan Adulto Pollo 15x100g', 15, 1878.71, [25, 20], 15034.44),
    l('12452939', 'Pro Plan Adult Small Breed 6x3kg', 5, 27826.88, [14], 116065.92),
    l('12570707', 'Excellent Gato Adulto 6x1kg', 12, 8396.49, [14], 84052.3),
    l('12570699', 'Excellent Gato Adulto 6x3kg', 3, 22967.69, [14], 57478.93),
    l('12570704', 'Excellent Gato Urinary 6x1kg', 12, 9781.92, [14], 97920.88),
    l('12452915', 'Pro Plan Puppy Medium Breed 6x3kg', 3, 29300.19, [14], 73326.67),
  ],
  subtotal: 443879.14,
  iva: [{ alicuota: 21, monto: 93214.61 }],
  percepciones: [
    { nombre: 'IIBB 4%', alicuota: 4, monto: 17755.17 },
    { nombre: 'Perc. IVA 3%', alicuota: 3, monto: 13316.37 },
  ],
  total: 568165.29,
})
const procesada = procesarBoleta(boleta)

describe('calcularVencimiento', () => {
  it('suma los días de la condición de pago', () => {
    expect(calcularVencimiento('2026-09-15', '10 días fecha factura')).toBe('2026-09-25')
    expect(calcularVencimiento('2026-09-15', '30 DIAS')).toBe('2026-10-15')
  })
  it('null si no hay días o fecha', () => {
    expect(calcularVencimiento('2026-09-15', 'Contado')).toBeNull()
    expect(calcularVencimiento(null, '10 días')).toBeNull()
  })
})

describe('armarPayloadFactura — Caso A', () => {
  const payload = armarPayloadFactura({
    proveedorId: 'prov-1',
    boleta,
    procesada,
    estado: 'ok',
    productoIds: ['p1', null, 'p3', 'p4', 'p5', 'p6'],
    archivoAdjunto: 'ruta.pdf',
    hashImagen: 'abc',
  })

  it('totales de cabecera', () => {
    expect(payload.tipo_comprobante).toBe('Factura A')
    expect(payload.total).toBe(568165.29)
    expect(payload.subtotal).toBe(443879.14)
    expect(payload.iva_total).toBe(93214.61)
    expect(payload.percepciones_total).toBeCloseTo(31071.54, 2)
    expect(payload.vencimiento).toBe('2026-09-25')
    expect(payload.estado).toBe('cargada')
    expect(payload.hash_imagen).toBe('abc')
  })
  it('la suma de los totales de línea más el ajuste da el total impreso', () => {
    const suma = payload.items.reduce((a, it) => a + (it.total_linea ?? 0), 0)
    expect(suma + (payload.ajuste_redondeo ?? 0)).toBeCloseTo(568165.29, 2)
  })
  it('cada ítem lleva el detalle y respeta el producto vinculado', () => {
    expect(payload.items).toHaveLength(6)
    expect(payload.items[0]).toMatchObject({
      producto_id: 'p1',
      cantidad: 15,
      bonificaciones: [25, 20],
      es_regalo: false,
      codigo_proveedor: '12341823',
    })
    expect(payload.items[1].producto_id).toBeNull()
    expect(payload.items[0].costo_unitario).toBeCloseTo(15034.44 / 15, 3)
  })
  it('estado revision se propaga', () => {
    const p = armarPayloadFactura({
      proveedorId: 'x', boleta, procesada, estado: 'revision', productoIds: [], archivoAdjunto: null, hashImagen: null,
    })
    expect(p.estado).toBe('revision')
  })
  it('sin fecha no se puede armar', () => {
    const sinFecha = { ...boleta, fecha: null }
    expect(() =>
      armarPayloadFactura({ proveedorId: 'x', boleta: sinFecha, procesada, estado: 'ok', productoIds: [], archivoAdjunto: null, hashImagen: null })
    ).toThrow()
  })
})

describe('regalos en el payload', () => {
  it('un regalo va con costo 0 y total 0', () => {
    const b = sanearBoletaExtraida({
      tipo: 'factura_A',
      fecha: '2026-09-21',
      numero_comprobante: '0100-00004502',
      lineas: [
        { descripcion: 'Soft Cream', cantidad: 6, precio_lista: 0, es_regalo: true, leyenda_regalo: 'sin cargo' },
        { descripcion: 'Nutrique', cantidad: 1, precio_lista: 1000, importe: 1000, es_regalo: false },
      ],
      iva: [{ alicuota: 21, monto: 210 }],
      total: 1210,
    })
    const p = armarPayloadFactura({
      proveedorId: 'x', boleta: b, procesada: procesarBoleta(b), estado: 'ok', productoIds: [null, null], archivoAdjunto: null, hashImagen: null,
    })
    expect(p.items[0]).toMatchObject({ es_regalo: true, costo_unitario: 0, total_linea: 0, leyenda_regalo: 'sin cargo' })
    expect(p.items[1].total_linea).toBe(1210)
  })
})

const proveedor = (extra: Partial<Proveedor> = {}): Proveedor => ({
  id: 'p', nombre: 'Nestlé', cuit: null, telefono: null, email: null, direccion: null, notas: null,
  aplica_iibb: false, tasa_iibb: 4, aplica_perc_iva: false, tasa_perc_iva: 3, descuento_pronto_pago: 0,
  razon_social: null, alias: [], tipos_comprobante: [], condicion_pago_habitual: null, formato_habitual: null,
  primera_boleta: null, ultima_boleta: null, cantidad_boletas: 0, total_acumulado: 0, activo: true, created_at: '',
  ...extra,
})

describe('completarProveedorDesdeBoleta', () => {
  it('completa lo vacío y agrega el nombre leído como alias', () => {
    const patch = completarProveedorDesdeBoleta(proveedor(), boleta)
    expect(patch.cuit).toBe('30-54676404-0')
    expect(patch.razon_social).toBe('NESTLE ARGENTINA S.A.')
    expect(patch.condicion_pago_habitual).toBe('10 días fecha factura')
    expect(patch.alias).toEqual(['NESTLE ARGENTINA S.A.'])
  })
  it('nunca pisa un CUIT existente ni repite alias', () => {
    const patch = completarProveedorDesdeBoleta(
      proveedor({ cuit: '30-11111111-8', razon_social: 'X', alias: ['nestle argentina s.a.'], condicion_pago_habitual: 'Contado' }),
      boleta
    )
    expect(patch).toEqual({})
  })
  it('no guarda un CUIT con dígito verificador inválido', () => {
    const b = { ...boleta, proveedor_cuit: '30-54676404-1' }
    expect(completarProveedorDesdeBoleta(proveedor(), b).cuit).toBeUndefined()
  })
})

describe('buscarFacturaDuplicada', () => {
  const f = (estado: FacturaCompra['estado'], numero: string, tipo = 'Factura A') =>
    ({ estado, numero_comprobante: numero, tipo_comprobante: tipo }) as FacturaCompra

  it('encuentra misma clave activa', () => {
    expect(buscarFacturaDuplicada([f('cargada', '0395-1')], 'Factura A', '0395-1')).not.toBeNull()
  })
  it('reconoce el número aunque el formato guardado sea distinto', () => {
    expect(buscarFacturaDuplicada([f('cargada', 'A-00003-00015831')], 'Factura A', '00003-00015831')).not.toBeNull()
  })
  it('ignora anuladas, otros tipos y número vacío', () => {
    expect(buscarFacturaDuplicada([f('anulada', '0395-1')], 'Factura A', '0395-1')).toBeNull()
    expect(buscarFacturaDuplicada([f('cargada', '0395-1', 'Remito')], 'Factura A', '0395-1')).toBeNull()
    expect(buscarFacturaDuplicada([f('cargada', '0395-1')], 'Factura A', null)).toBeNull()
  })
})
