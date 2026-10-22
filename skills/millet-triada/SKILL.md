---
name: millet-triada
description: Usar antes de tocar Compras (OC), Almacén o Cuentas por Pagar del Millet ERP, o sus eventos, listeners, tolerancias, devoluciones, valuación de inventario o cierre de OC. Reglas del three-way match Compras-Almacén-CxP y contratos de eventos canónicos.
---

# Triada Compras ↔ Almacén ↔ CxP (three-way match)

Fuente: `CLAUDE.md` líneas 83-124 (sección "Triada"), `.claude/project-test-rules.md` (sección Triada), ADR-0009.
**Antes de tocar cualquiera de los tres, leer los tres levantamientos juntos:**
- `docs/modulos/compras-ordenes-compra/01-diseno.md` (§8.5-8.6 naming de eventos)
- `docs/modulos/cuentas-por-pagar/00-levantamiento.md` §11.6 (contratos canónicos)
- `docs/modulos/almacen/00-levantamiento.md` §5, §8, §10.7 (tolerancias) y §11

## Reglas de oro (invariantes; repetirlas en el prompt de cada paso)
1. **Cero acceso directo a tablas de otro módulo.** Solo `I*ReadPort` o eventos.
2. **Almacén NO crea `FacturaProveedor` en CxP.** En variante A solo referencia el `CfdiRecibido`; CxP captura la factura por su flujo.
3. **Precio de inventario = precio de la OC**, en variantes A y B. La diferencia con la factura se resuelve aguas arriba (corrección de OC) o con `DiferenciaPrecioFacturaDetectadaEvent`.
4. **El cierre de OC lo evalúa Compras**, no Almacén ni CxP. Compras combina los 3 sub-estados (Recepción + Facturación + Pago) y emite `OrdenCompraCerradaEvent`.
5. **Tres tolerancias ortogonales**: cantidad por línea de OC (Compras); cantidad por material (Almacén / `DatosMaestros`); monto por proveedor (CxP / `DatosMaestros`). No mezclarlas.
6. **Dos semánticas de devolución**: interna (Almacén 8.A, no cruza con CxP) y a proveedor (8.B, sí cruza: genera `NotaCargo`). No confundir.
7. **Consumidores idempotentes**: correlacionar por `recepcion_id`, `devolucion_a_proveedor_id`, `factura_id`, `nota_cargo_id`. Mismo evento dos veces = un solo efecto.
8. **Acumulados calculados por el publisher**: eventos por línea de OC llevan el acumulado total post-evento (`LineasAcumuladasOc[]`); Compras lo aplica directo en `OrdenCompra.RegistrarFacturacionLinea`, sin proyecciones espejo. Igual para cantidad recibida y monto pagado.
9. Naming: `{Agregado}{Verbo}Event` (sufijo `Event`, prefijo del agregado de origen).

## Variantes de recepción (Almacén §5)
- **A (insumos, con factura)**: recepción con CFDI; factura la captura CxP.
- **B (materiales directos, packing list)**: recepción con `factura_pendiente=true`; al llegar la factura CxP emite `FacturaProveedorRegistradaEvent` y Almacén concilia.
- Fuera de tolerancia: requiere autorización (Supervisor de Insumos para insumos; Jefe Almacén para materiales directos), `almacen/00-levantamiento.md` §5.6 (inferido: el texto está justo antes de §5.7).

## Eventos canónicos
| Evento | Publica | Suscribe |
|---|---|---|
| `OrdenCompraAutorizadaEvent` | Compras | Almacén, CxP |
| `OrdenCompraCanceladaEvent` | Compras | Almacén, CxP, Requisiciones |
| `OrdenCompraCerradaEvent` | Compras | Almacén (informativo), Requisiciones |
| `OcRecepcionRegistradaEvent` | Almacén | Compras (sub-estado Recepción), CxP |
| `OcDevolucionRegistradaEvent` | Almacén (8.B) | Compras (decrementa `CantidadRecibida`), CxP (`NotaCargo`) |
| `FacturaProveedorRegistradaEvent` | CxP | Compras (Facturación), Almacén (variante B) |
| `FacturaProveedorRechazadaPorToleranciaEvent` | CxP | Compras |
| `FacturaProveedorAutorizadaEvent` | CxP | Compras (informativo), Contabilidad |
| `FacturaProveedorCanceladaEvent` | CxP | Compras (decrementa `CantidadFacturada`), Contabilidad |
| `NotaCreditoProveedorRegistradaEvent` | CxP | Compras, Contabilidad |
| `NotaCreditoFiscalDevolucionRecibidaEvent` | CxP | Almacén (cierra devolución 8.B, `ConciliadaConNcFiscal`) |
| `CfdiRecibidoIngresadoEvent` | CxP | Almacén (enlace diferido variante A, `cfdi_uuid_fiscal`) |
| `DiferenciaPrecioFacturaDetectadaEvent` | CxP | Almacén (ajusta costo), Compras |
| `PasivoAutorizadoParaPagoEvent` | CxP | Tesorería |
| `PagoFacturaProveedorEvent` | Tesorería | Compras (Pago), CxP |

Detalle de campos de cada evento: `cuentas-por-pagar/00-levantamiento.md` §11.6. No inventar campos; leerlos allí y en el record del código.

## Workers (Service Bus) y dónde viven
Clases: `ComprasEventListenerWorker`/`AlmacenEventListenerWorker`/`TesoreriaEventListenerWorker` (en CxP), `CxpEventListenerWorker` (en Almacén y en Compras), `AlmacenEventListenerWorker` (en Compras). Topics: `compras-events`, `almacen-events`, `cuentas-por-pagar-events`, `tesoreria-events`. Código en `backend/src/<Modulo>/Infrastructure/Workers/` y handlers en `<Modulo>/Application/EventListeners/`. Topics/subscriptions se declaran en `infra/modules/servicebus.bicep` (no crear topics por consumidor: una subscription nueva del mismo topic).
- Pago en Compras llega vía `cuentas_por_pagar.factura.pago-aplicado.v1` (CxP re-publica el pago); no hay listener de Tesorería en Compras.
- `NotaCreditoProveedorRegistradaListener` (Compras) está huérfano a propósito: PLATFORM-TODO `<NcGranularidadLineaOc>`; el evento se loggea como informativo.

## Cómo cambiar algo de la triada
1. Leer los tres levantamientos; decidir qué módulo es dueño del dato (el publisher calcula).
2. Cambio de contrato de evento: versionar (`.v1` → `.v2`), consumidores manejan ambas versiones; actualizar los tres docs y la tabla de `CLAUDE.md`.
3. Listener nuevo: wrapper idempotente (tabla de eventos procesados) + handler MediatR + test de entrega doble.
4. UI de OC/recepción/factura: usar los estados exactos de `design-system/DESIGN.md` §7.2 y la conciliación de tres vías (§4.5, §4.10) con frases, nunca siglas.

## Checklist de verificación (de `.claude/project-test-rules.md`)
- [ ] Leídos los tres levantamientos antes de generar filas de prueba.
- [ ] Evento emitido al ejecutar la acción desde la UI (verificar Outbox / consumidor / estado en el módulo destino).
- [ ] Entrega duplicada del mismo evento = un solo efecto (`./tools/validate-integration-isolated.sh`).
- [ ] `rg` negativo: Almacén no crea facturas en CxP; el precio de inventario sale de la OC; Compras decide el cierre.
- [ ] Ningún módulo toca tablas de otro.
- [ ] En dev compartido, un write que emite evento deja una fila en Outbox que la instancia desplegada puede despachar: declarar qué eventos emite o marcar `@no-dev` (ver skill `millet-qa`).

## Contradicciones y huecos en los docs
- `CLAUDE.md` nombra eventos en PascalCase; en el bus viajan como `modulo.entidad.accion.v1` (p. ej. `factura.pago-aplicado.v1`). Ambos son válidos; no confundirlos.
- ADR-0009 prescribe `integration_events_processed`; Almacén implementa `almacen.eventos_procesados` con PK `(evento_id, evento_tipo)`. Copiar la implementación del módulo vecino.
