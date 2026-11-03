// Generado desde la base de Supabase (herramienta generate_typescript_types del MCP de Supabase).
// No editar a mano: cuando cambie una tabla o una función en la base, volver a generarlo.
// Los tipos precisos que usa la app (uniones como 'cargada' | 'anulada') viven en types/database.ts.
type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      clientes: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nombre: string
          telefono: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          telefono?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          telefono?: string | null
        }
        Relationships: []
      }
      entradas_stock_sugeridas: {
        Row: {
          cantidad_recibida: number | null
          cantidad_sugerida: number
          confirmada_en: string | null
          confirmada_por: string | null
          created_at: string
          estado: string
          factura_id: string
          id: string
          nota: string | null
          producto_id: string
        }
        Insert: {
          cantidad_recibida?: number | null
          cantidad_sugerida: number
          confirmada_en?: string | null
          confirmada_por?: string | null
          created_at?: string
          estado?: string
          factura_id: string
          id?: string
          nota?: string | null
          producto_id: string
        }
        Update: {
          cantidad_recibida?: number | null
          cantidad_sugerida?: number
          confirmada_en?: string | null
          confirmada_por?: string | null
          created_at?: string
          estado?: string
          factura_id?: string
          id?: string
          nota?: string | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entradas_stock_sugeridas_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_stock_sugeridas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas_compra: {
        Row: {
          ajuste_redondeo: number
          archivo_adjunto: string | null
          cae: string | null
          cae_vto: string | null
          condicion_pago: string | null
          created_at: string
          created_by: string | null
          es_fiscal: boolean
          estado: string
          fecha: string
          hash_imagen: string | null
          id: string
          impuestos: Json
          iva_total: number
          notas: string | null
          numero_comprobante: string
          orden_compra: string | null
          pedido: string | null
          percepciones_total: number
          pronto_pago: Json
          pronto_pago_elegido: number
          proveedor_id: string
          remito: string | null
          subtotal: number
          tipo_comprobante: string
          total: number
          total_calculado: number | null
          vencimiento: string | null
        }
        Insert: {
          ajuste_redondeo?: number
          archivo_adjunto?: string | null
          cae?: string | null
          cae_vto?: string | null
          condicion_pago?: string | null
          created_at?: string
          created_by?: string | null
          es_fiscal?: boolean
          estado?: string
          fecha: string
          hash_imagen?: string | null
          id?: string
          impuestos?: Json
          iva_total: number
          notas?: string | null
          numero_comprobante: string
          orden_compra?: string | null
          pedido?: string | null
          percepciones_total?: number
          pronto_pago?: Json
          pronto_pago_elegido?: number
          proveedor_id: string
          remito?: string | null
          subtotal: number
          tipo_comprobante: string
          total: number
          total_calculado?: number | null
          vencimiento?: string | null
        }
        Update: {
          ajuste_redondeo?: number
          archivo_adjunto?: string | null
          cae?: string | null
          cae_vto?: string | null
          condicion_pago?: string | null
          created_at?: string
          created_by?: string | null
          es_fiscal?: boolean
          estado?: string
          fecha?: string
          hash_imagen?: string | null
          id?: string
          impuestos?: Json
          iva_total?: number
          notas?: string | null
          numero_comprobante?: string
          orden_compra?: string | null
          pedido?: string | null
          percepciones_total?: number
          pronto_pago?: Json
          pronto_pago_elegido?: number
          proveedor_id?: string
          remito?: string | null
          subtotal?: number
          tipo_comprobante?: string
          total?: number
          total_calculado?: number | null
          vencimiento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturas_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria: string
          concepto: string
          created_at: string
          created_by: string | null
          fecha: string
          id: string
          monto: number
          notas: string | null
          proveedor: string | null
          rama: string | null
        }
        Insert: {
          categoria: string
          concepto: string
          created_at?: string
          created_by?: string | null
          fecha: string
          id?: string
          monto: number
          notas?: string | null
          proveedor?: string | null
          rama?: string | null
        }
        Update: {
          categoria?: string
          concepto?: string
          created_at?: string
          created_by?: string | null
          fecha?: string
          id?: string
          monto?: number
          notas?: string | null
          proveedor?: string | null
          rama?: string | null
        }
        Relationships: []
      }
      items_factura: {
        Row: {
          alicuota_iva: number
          bonificaciones: Json
          cantidad: number
          codigo_proveedor: string | null
          costo_unitario: number
          descripcion_original: string | null
          es_regalo: boolean
          factura_id: string
          id: string
          iva_monto: number | null
          leyenda_regalo: string | null
          neto_linea: number | null
          percepciones: Json
          precio_final_unitario: number | null
          precio_lista: number | null
          producto_id: string | null
          subtotal: number
          total_linea: number | null
        }
        Insert: {
          alicuota_iva: number
          bonificaciones?: Json
          cantidad: number
          codigo_proveedor?: string | null
          costo_unitario: number
          descripcion_original?: string | null
          es_regalo?: boolean
          factura_id: string
          id?: string
          iva_monto?: number | null
          leyenda_regalo?: string | null
          neto_linea?: number | null
          percepciones?: Json
          precio_final_unitario?: number | null
          precio_lista?: number | null
          producto_id?: string | null
          subtotal: number
          total_linea?: number | null
        }
        Update: {
          alicuota_iva?: number
          bonificaciones?: Json
          cantidad?: number
          codigo_proveedor?: string | null
          costo_unitario?: number
          descripcion_original?: string | null
          es_regalo?: boolean
          factura_id?: string
          id?: string
          iva_monto?: number | null
          leyenda_regalo?: string | null
          neto_linea?: number | null
          percepciones?: Json
          precio_final_unitario?: number | null
          precio_lista?: number | null
          producto_id?: string | null
          subtotal?: number
          total_linea?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "items_factura_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_factura_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      items_venta: {
        Row: {
          cantidad: number
          costo_unitario_snapshot: number | null
          id: string
          precio_unitario: number
          producto_id: string | null
          servicio_id: string | null
          subtotal: number
          tipo: string
          venta_id: string
        }
        Insert: {
          cantidad: number
          costo_unitario_snapshot?: number | null
          id?: string
          precio_unitario: number
          producto_id?: string | null
          servicio_id?: string | null
          subtotal: number
          tipo: string
          venta_id: string
        }
        Update: {
          cantidad?: number
          costo_unitario_snapshot?: number | null
          id?: string
          precio_unitario?: number
          producto_id?: string | null
          servicio_id?: string | null
          subtotal?: number
          tipo?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_venta_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_venta_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_venta_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      limites_uso: {
        Row: {
          creado_en: string
          endpoint: string
          id: number
          usuario_id: string
        }
        Insert: {
          creado_en?: string
          endpoint: string
          id?: never
          usuario_id: string
        }
        Update: {
          creado_en?: string
          endpoint?: string
          id?: never
          usuario_id?: string
        }
        Relationships: []
      }
      movimientos_stock: {
        Row: {
          cantidad: number
          factura_id: string | null
          fecha: string
          id: string
          motivo: string | null
          producto_id: string
          tipo: string
          usuario_id: string | null
          venta_id: string | null
        }
        Insert: {
          cantidad: number
          factura_id?: string | null
          fecha?: string
          id?: string
          motivo?: string | null
          producto_id: string
          tipo: string
          usuario_id?: string | null
          venta_id?: string | null
        }
        Update: {
          cantidad?: number
          factura_id?: string | null
          fecha?: string
          id?: string
          motivo?: string | null
          producto_id?: string
          tipo?: string
          usuario_id?: string | null
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_stock_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          nombre: string
          rol: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          nombre: string
          rol?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          nombre?: string
          rol?: string
        }
        Relationships: []
      }
      precios_proveedor: {
        Row: {
          actualizado_en: string
          created_at: string
          id: string
          nota: string | null
          precio: number
          producto_id: string
          proveedor_id: string
        }
        Insert: {
          actualizado_en?: string
          created_at?: string
          id?: string
          nota?: string | null
          precio: number
          producto_id: string
          proveedor_id: string
        }
        Update: {
          actualizado_en?: string
          created_at?: string
          id?: string
          nota?: string | null
          precio?: number
          producto_id?: string
          proveedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "precios_proveedor_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precios_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          alicuota_iva: number
          categoria: string | null
          codigo: string | null
          codigo_barras: string | null
          costo_unitario_actual: number
          created_at: string
          factor_conversion: number
          id: string
          nombre: string
          precio_venta: number
          rama: string | null
          stock_actual: number
          stock_minimo: number
          subcategoria: string | null
          unidad_compra: string
          unidad_stock: string
        }
        Insert: {
          activo?: boolean
          alicuota_iva?: number
          categoria?: string | null
          codigo?: string | null
          codigo_barras?: string | null
          costo_unitario_actual?: number
          created_at?: string
          factor_conversion?: number
          id?: string
          nombre: string
          precio_venta?: number
          rama?: string | null
          stock_actual?: number
          stock_minimo?: number
          subcategoria?: string | null
          unidad_compra: string
          unidad_stock: string
        }
        Update: {
          activo?: boolean
          alicuota_iva?: number
          categoria?: string | null
          codigo?: string | null
          codigo_barras?: string | null
          costo_unitario_actual?: number
          created_at?: string
          factor_conversion?: number
          id?: string
          nombre?: string
          precio_venta?: number
          rama?: string | null
          stock_actual?: number
          stock_minimo?: number
          subcategoria?: string | null
          unidad_compra?: string
          unidad_stock?: string
        }
        Relationships: []
      }
      proveedores: {
        Row: {
          activo: boolean
          alias: string[]
          aplica_iibb: boolean
          aplica_perc_iva: boolean
          cantidad_boletas: number
          condicion_pago_habitual: string | null
          created_at: string
          cuit: string | null
          descuento_pronto_pago: number
          direccion: string | null
          email: string | null
          formato_habitual: string | null
          id: string
          nombre: string
          notas: string | null
          primera_boleta: string | null
          razon_social: string | null
          tasa_iibb: number
          tasa_perc_iva: number
          telefono: string | null
          tipos_comprobante: string[]
          total_acumulado: number
          ultima_boleta: string | null
        }
        Insert: {
          activo?: boolean
          alias?: string[]
          aplica_iibb?: boolean
          aplica_perc_iva?: boolean
          cantidad_boletas?: number
          condicion_pago_habitual?: string | null
          created_at?: string
          cuit?: string | null
          descuento_pronto_pago?: number
          direccion?: string | null
          email?: string | null
          formato_habitual?: string | null
          id?: string
          nombre: string
          notas?: string | null
          primera_boleta?: string | null
          razon_social?: string | null
          tasa_iibb?: number
          tasa_perc_iva?: number
          telefono?: string | null
          tipos_comprobante?: string[]
          total_acumulado?: number
          ultima_boleta?: string | null
        }
        Update: {
          activo?: boolean
          alias?: string[]
          aplica_iibb?: boolean
          aplica_perc_iva?: boolean
          cantidad_boletas?: number
          condicion_pago_habitual?: string | null
          created_at?: string
          cuit?: string | null
          descuento_pronto_pago?: number
          direccion?: string | null
          email?: string | null
          formato_habitual?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          primera_boleta?: string | null
          razon_social?: string | null
          tasa_iibb?: number
          tasa_perc_iva?: number
          telefono?: string | null
          tipos_comprobante?: string[]
          total_acumulado?: number
          ultima_boleta?: string | null
        }
        Relationships: []
      }
      registro_cambios: {
        Row: {
          creado_en: string
          detalle: Json
          id: string
          operacion: string
          proveedor_id: string | null
          registro_id: string
          tabla: string
          usuario_id: string | null
          usuario_nombre: string
        }
        Insert: {
          creado_en?: string
          detalle?: Json
          id?: string
          operacion: string
          proveedor_id?: string | null
          registro_id: string
          tabla: string
          usuario_id?: string | null
          usuario_nombre: string
        }
        Update: {
          creado_en?: string
          detalle?: Json
          id?: string
          operacion?: string
          proveedor_id?: string | null
          registro_id?: string
          tabla?: string
          usuario_id?: string | null
          usuario_nombre?: string
        }
        Relationships: []
      }
      servicios: {
        Row: {
          activo: boolean
          categoria: string | null
          created_at: string
          id: string
          nombre: string
          precio: number
          rama: string | null
        }
        Insert: {
          activo?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          nombre: string
          precio?: number
          rama?: string | null
        }
        Update: {
          activo?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          nombre?: string
          precio?: number
          rama?: string | null
        }
        Relationships: []
      }
      ventas: {
        Row: {
          cliente_id: string | null
          created_at: string
          created_by: string | null
          estado: string
          fecha: string
          id: string
          iva_total: number
          medio_pago: string
          notas: string | null
          subtotal: number
          total: number
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          fecha: string
          id?: string
          iva_total?: number
          medio_pago: string
          notas?: string | null
          subtotal: number
          total: number
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          fecha?: string
          id?: string
          iva_total?: number
          medio_pago?: string
          notas?: string | null
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "ventas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          automaticos_activos: boolean
          id: boolean
        }
        Insert: {
          automaticos_activos?: boolean
          id?: boolean
        }
        Update: {
          automaticos_activos?: boolean
          id?: boolean
        }
        Relationships: []
      }
      whatsapp_conversaciones: {
        Row: {
          clave: string
          cliente_id: string | null
          creado_en: string
          id: string
          no_leidos: number
          nombre_whatsapp: string | null
          proveedor_id: string | null
          telefono: string
          ultimo_mensaje_en: string
          ultimo_texto: string | null
        }
        Insert: {
          clave: string
          cliente_id?: string | null
          creado_en?: string
          id?: string
          no_leidos?: number
          nombre_whatsapp?: string | null
          proveedor_id?: string | null
          telefono: string
          ultimo_mensaje_en?: string
          ultimo_texto?: string | null
        }
        Update: {
          clave?: string
          cliente_id?: string | null
          creado_en?: string
          id?: string
          no_leidos?: number
          nombre_whatsapp?: string | null
          proveedor_id?: string | null
          telefono?: string
          ultimo_mensaje_en?: string
          ultimo_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversaciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_mensajes: {
        Row: {
          conversacion_id: string
          creado_en: string
          direccion: string
          enviado_por: string | null
          estado: string
          id: string
          origen: string
          regla_tipo: string | null
          texto: string
          wa_message_id: string | null
        }
        Insert: {
          conversacion_id: string
          creado_en?: string
          direccion: string
          enviado_por?: string | null
          estado?: string
          id?: string
          origen?: string
          regla_tipo?: string | null
          texto: string
          wa_message_id?: string | null
        }
        Update: {
          conversacion_id?: string
          creado_en?: string
          direccion?: string
          enviado_por?: string | null
          estado?: string
          id?: string
          origen?: string
          regla_tipo?: string | null
          texto?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensajes_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_reglas: {
        Row: {
          abre: string | null
          activa: boolean
          cierra: string | null
          dias: number[]
          texto: string
          tipo: string
        }
        Insert: {
          abre?: string | null
          activa?: boolean
          cierra?: string | null
          dias?: number[]
          texto: string
          tipo: string
        }
        Update: {
          abre?: string | null
          activa?: boolean
          cierra?: string | null
          dias?: number[]
          texto?: string
          tipo?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _aplicar_items_factura: {
        Args: { p_factura_id: string; p_items: Json; p_motivo: string }
        Returns: undefined
      }
      _recalcular_stats_proveedor: {
        Args: { p_proveedor_id: string }
        Returns: undefined
      }
      _revertir_stock_factura: {
        Args: { p_factura_id: string; p_motivo: string }
        Returns: undefined
      }
      ajustar_stock_manual: {
        Args: { p_cantidad: number; p_motivo: string; p_producto_id: string }
        Returns: undefined
      }
      anular_factura_compra: {
        Args: { p_factura_id: string }
        Returns: undefined
      }
      anular_venta: { Args: { p_venta_id: string }; Returns: undefined }
      cambiar_pronto_pago_factura: {
        Args: { p_descuento: number; p_factura_id: string }
        Returns: undefined
      }
      confirmar_entrada_stock: {
        Args: {
          p_cantidad_recibida: number
          p_entrada_id: string
          p_nota?: string
        }
        Returns: undefined
      }
      consumir_cupo: {
        Args: { p_endpoint: string; p_max: number; p_ventana_segundos: number }
        Returns: boolean
      }
      editar_factura_compra: {
        Args: { p_factura_id: string; payload: Json }
        Returns: undefined
      }
      registrar_factura_compra: { Args: { payload: Json }; Returns: string }
      registrar_venta: { Args: { payload: Json }; Returns: string }
      whatsapp_buscar_vinculo: {
        Args: { p_clave: string }
        Returns: {
          cliente_id: string
          proveedor_id: string
        }[]
      }
      whatsapp_registrar_mensaje: {
        Args: {
          p_clave: string
          p_direccion: string
          p_enviado_por: string
          p_estado: string
          p_nombre: string
          p_origen: string
          p_proveedor_id: string
          p_regla_tipo: string
          p_telefono: string
          p_texto: string
          p_wa_message_id: string
        }
        Returns: {
          conversacion_id: string
          es_nuevo: boolean
          mensaje_id: string
          primera_vez: boolean
          vinculo_cliente_id: string
          vinculo_proveedor_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
