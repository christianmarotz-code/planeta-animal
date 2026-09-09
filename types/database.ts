export interface Proveedor {
  id: string
  nombre: string
  cuit: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  notas: string | null
  aplica_iibb: boolean
  tasa_iibb: number
  aplica_perc_iva: boolean
  tasa_perc_iva: number
  descuento_pronto_pago: number
  created_at: string
}

export interface Producto {
  id: string
  nombre: string
  categoria: string | null
  unidad_compra: string
  unidad_stock: string
  factor_conversion: number
  stock_actual: number
  stock_minimo: number
  costo_unitario_actual: number
  alicuota_iva: number
  activo: boolean
  created_at: string
}

export type TipoComprobante =
  | 'Factura A'
  | 'Factura B'
  | 'Factura C'
  | 'Remito'
  | 'Nota de Credito'

export type EstadoFactura = 'cargada' | 'anulada'

export interface FacturaCompra {
  id: string
  proveedor_id: string
  numero_comprobante: string
  tipo_comprobante: TipoComprobante
  fecha: string
  subtotal: number
  iva_total: number
  total: number
  estado: EstadoFactura
  archivo_adjunto: string | null
  notas: string | null
  created_at: string
  created_by: string | null
}

export interface ItemFactura {
  id: string
  factura_id: string
  producto_id: string
  cantidad: number
  costo_unitario: number
  alicuota_iva: number
  subtotal: number
}

export type TipoMovimientoStock = 'entrada_compra' | 'ajuste_manual'

export interface MovimientoStock {
  id: string
  producto_id: string
  tipo: TipoMovimientoStock
  cantidad: number
  fecha: string
  factura_id: string | null
  motivo: string | null
  usuario_id: string | null
}

export interface Database {
  public: {
    Tables: {
      proveedores: { Row: Proveedor; Insert: Partial<Proveedor>; Update: Partial<Proveedor> }
      productos: { Row: Producto; Insert: Partial<Producto>; Update: Partial<Producto> }
      facturas_compra: {
        Row: FacturaCompra
        Insert: Partial<FacturaCompra>
        Update: Partial<FacturaCompra>
      }
      items_factura: {
        Row: ItemFactura
        Insert: Partial<ItemFactura>
        Update: Partial<ItemFactura>
      }
      movimientos_stock: {
        Row: MovimientoStock
        Insert: Partial<MovimientoStock>
        Update: Partial<MovimientoStock>
      }
    }
  }
}
