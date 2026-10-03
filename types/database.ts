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
  razon_social: string | null
  alias: string[]
  tipos_comprobante: string[]
  condicion_pago_habitual: string | null
  formato_habitual: string | null
  primera_boleta: string | null
  ultima_boleta: string | null
  cantidad_boletas: number
  total_acumulado: number
  activo: boolean
  created_at: string
}

export type Rama = 'clinica' | 'petshop'

export interface Producto {
  id: string
  nombre: string
  categoria: string | null
  rama: Rama | null
  subcategoria?: string | null
  unidad_compra: string
  unidad_stock: string
  factor_conversion: number
  stock_actual: number
  stock_minimo: number
  costo_unitario_actual: number
  precio_venta: number
  alicuota_iva: number
  activo: boolean
  codigo: string | null
  codigo_barras: string | null
  created_at: string
}

export type TipoComprobante =
  | 'Factura A'
  | 'Factura B'
  | 'Factura C'
  | 'Remito'
  | 'Nota de Credito'
  | 'Ticket Factura'
  | 'Presupuesto X'
  | 'Pedido X'
  | 'Comprobante Interno'

export type EstadoFactura = 'cargada' | 'anulada' | 'revision'

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
  es_fiscal: boolean
  condicion_pago: string | null
  vencimiento: string | null
  cae: string | null
  cae_vto: string | null
  pedido: string | null
  remito: string | null
  orden_compra: string | null
  percepciones_total: number
  ajuste_redondeo: number
  total_calculado: number | null
  hash_imagen: string | null
  impuestos: { tipo: string; alicuota: number | null; monto: number }[]
  pronto_pago: { dias: number; descuento: number }[]
  pronto_pago_elegido: number
}

export interface ItemFactura {
  id: string
  factura_id: string
  producto_id: string | null
  cantidad: number
  costo_unitario: number
  alicuota_iva: number
  subtotal: number
  codigo_proveedor: string | null
  descripcion_original: string | null
  precio_lista: number | null
  bonificaciones: number[]
  neto_linea: number | null
  iva_monto: number | null
  percepciones: { nombre: string; monto: number }[]
  total_linea: number | null
  precio_final_unitario: number | null
  es_regalo: boolean
  leyenda_regalo: string | null
}

export interface EntradaStockSugerida {
  id: string
  factura_id: string
  producto_id: string
  cantidad_sugerida: number
  cantidad_recibida: number | null
  estado: 'pendiente' | 'confirmada'
  nota: string | null
  confirmada_por: string | null
  confirmada_en: string | null
  created_at: string
}

export type TipoMovimientoStock = 'entrada_compra' | 'ajuste_manual' | 'salida_venta'

export interface MovimientoStock {
  id: string
  producto_id: string
  tipo: TipoMovimientoStock
  cantidad: number
  fecha: string
  factura_id: string | null
  venta_id: string | null
  motivo: string | null
  usuario_id: string | null
}

export type CategoriaGasto = 'combustible' | 'servicios' | 'indumentaria' | 'impuestos' | 'otro'

export interface Gasto {
  id: string
  fecha: string
  categoria: CategoriaGasto
  concepto: string
  proveedor: string | null
  monto: number
  rama: Rama | null
  notas: string | null
  created_at: string
  created_by: string | null
}

export interface PrecioProveedor {
  id: string
  proveedor_id: string
  producto_id: string
  precio: number
  actualizado_en: string
  created_at: string
}

export type RolPerfil = 'administrador' | 'empleado'

export interface Perfil {
  id: string
  nombre: string
  avatar_url: string | null
  rol: RolPerfil
  created_at: string
}

export type MedioPago = 'efectivo' | 'tarjeta' | 'transferencia'
export type EstadoVenta = 'confirmada' | 'anulada'
export type TipoItemVenta = 'producto' | 'servicio'

export interface Servicio {
  id: string
  nombre: string
  categoria: string | null
  rama: Rama | null
  precio: number
  activo: boolean
  created_at: string
}

export interface Cliente {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  created_at: string
}

export interface Venta {
  id: string
  cliente_id: string | null
  fecha: string
  medio_pago: MedioPago
  subtotal: number
  iva_total: number
  total: number
  estado: EstadoVenta
  notas: string | null
  created_at: string
  created_by: string | null
}

export interface ItemVenta {
  id: string
  venta_id: string
  tipo: TipoItemVenta
  producto_id: string | null
  servicio_id: string | null
  cantidad: number
  precio_unitario: number
  costo_unitario_snapshot: number | null
  subtotal: number
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
      perfiles: { Row: Perfil; Insert: Partial<Perfil>; Update: Partial<Perfil> }
      gastos: { Row: Gasto; Insert: Partial<Gasto>; Update: Partial<Gasto> }
      precios_proveedor: {
        Row: PrecioProveedor
        Insert: Partial<PrecioProveedor>
        Update: Partial<PrecioProveedor>
      }
      servicios: { Row: Servicio; Insert: Partial<Servicio>; Update: Partial<Servicio> }
      clientes: { Row: Cliente; Insert: Partial<Cliente>; Update: Partial<Cliente> }
      ventas: { Row: Venta; Insert: Partial<Venta>; Update: Partial<Venta> }
      items_venta: { Row: ItemVenta; Insert: Partial<ItemVenta>; Update: Partial<ItemVenta> }
    }
  }
}
