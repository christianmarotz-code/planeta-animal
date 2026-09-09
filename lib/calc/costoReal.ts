export interface ConfiguracionImpuestosProveedor {
  aplicaIibb: boolean
  tasaIibb: number
  aplicaPercIva: boolean
  tasaPercIva: number
  descuentoProntoPago: number
}

export function calcularFactorAjuste(
  alicuotaIva: number,
  config: ConfiguracionImpuestosProveedor
): number {
  let factor = 1 + alicuotaIva / 100
  if (config.aplicaIibb) factor += config.tasaIibb / 100
  if (config.aplicaPercIva) factor += config.tasaPercIva / 100
  factor *= 1 - config.descuentoProntoPago / 100
  return factor
}

export function calcularCostoRealUnitario(
  costoUnitarioNeto: number,
  alicuotaIva: number,
  config: ConfiguracionImpuestosProveedor
): number {
  return costoUnitarioNeto * calcularFactorAjuste(alicuotaIva, config)
}
