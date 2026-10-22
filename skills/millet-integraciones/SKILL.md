---
name: millet-integraciones
description: Usar al tocar integraciones externas del Millet ERP: A+W (Hybrid Connection, EDI, drop service, tablas puente, ADR-0048), CFDI 4.0/FiscalAPI (PAC), Azure Service Bus con Outbox, buzón Graph (mailbox), Entra ID o correo saliente. Regla dura: nunca golpear sistemas externos reales; usar simuladores y stubs.
---

# Millet ERP: integraciones externas

Fuentes: `CLAUDE.md` (Integración A+W), `docs/integration/00..09`, ADR-0009, 0020, 0026, 0037, 0038, 0048, 0049, `docs/modulos/integraciones-{aw,fiscal,mailbox}/`, `.claude/project-test-rules.md` (reglas absolutas), `tools/*/README.md`.

## REGLA DURA: no tocar sistemas externos reales
Sin permiso **explícito en el chat, para ese caso concreto**, nunca:
- crear/modificar/borrar cuentas, usuarios, grupos o permisos en Microsoft Entra / Graph (tampoco "indirectamente" desde la API del ERP, p. ej. alta de colaborador con provisión de cuenta);
- enviar correos o notificaciones reales;
- llamar al PAC/SAT (FiscalAPI), A+W, Service Bus u otros servicios de Azure;
- timbrar/cancelar CFDI, pagar o contabilizar.
Verificar **no autoriza** efectos fuera del repo, de Docker local y de las BD `test`/`<db>_evidence`. Si falta usuario o rol de prueba: preguntar (usar un usuario real existente, que el owner cree la cuenta, o marcar el caso `BLOQUEADO`). Nunca crear cuentas.
- Un "health" local verde o pruebas compiladas **no acreditan** una integración real (README de backend y docs 07/09 lo repiten). No declarar "integrado" sin la ruta real probada con permiso.
- Secretos jamás en código/`appsettings`/commits: Key Vault + user-secrets. Datos reales de A+W (PII de clientes) nunca a seeds, evidencias o commits.

## Simuladores y stubs disponibles (usar estos)
| Qué | Cómo | Notas |
|---|---|---|
| Entra/Graph/correo | `Entra__Proveedor=Simulado` (valores `Simulado`/`Graph`; Program.cs lo valida). Código: `Identidad/Infrastructure/Stubs/DirectorioEntraSimulado.cs`, `CorreoSalienteSimulado.cs`, `Api/Auth/Provisioning/CorreoSandboxLocal.cs` | El arnés de verificación se niega a arrancar si `backend.require` no se cumple. Auth local de tests: `Auth__Mode=FakeForLocalDev` (solo tests de integración; en verificación E2E se usan usuarios reales de Entra, ver `millet-qa`) |
| A+W SQL Server | `tools/aw-sandbox/aw-sandbox.sh up` (SQL Server 2022 compat 130, esquema SYSADM íntegro, `127.0.0.1:14330`); `mutar <caso>`, `reseed`, `down`. Tests opt-in: `dotnet test backend/tests/Api.IntegrationTests --filter "Category=AwSandbox"` con `AW_SANDBOX_CONN` | Datos sintéticos. `AW_FULL` tiene datos reales: viven solo en el volumen Docker, prohibido volcarlos. `reset` borra el volumen |
| A+W copia PostgreSQL (demo) | `bash tools/aw-origen-demo/aw-origen-demo.sh up|env|reseed|pedidos|importar` | `IntegracionesAw:OrigenDemo:Permitido` false por defecto, true en Development; `Production` siempre bloquea. Sin conexión => 422, no hay fallback silencioso |
| Origen A+W por área | modos `Simulado`/`Sql` en `AwClientesOptions`, `AwProductosOptions` (`Integraciones.Aw/Application/...`); `AwClientesOrigenSimulado.cs` | Clientes: flags `LecturaHabilitada` y `AplicacionHabilitada`; productos: `OrigenHabilitado`; todo deshabilitado por defecto |
| Service Bus | `./tools/servicebus-emulator/levantar.sh` y `ServiceBus__Modo=EmuladorLocal` (solo `Development`); sin cadena => `NoOpIntegrationEventBusSender` descarta eventos | Aviso en README: con emulador, Tesorería confirma pago => Facturación emite complemento de pago automáticamente (la regla de Millet es manual; U1.1) |
| Outbox/workers en tests | `Outbox__Disabled=true`, `Compras__Outbox__Disabled=true`, `IntegracionesAw__Outbox__Disabled=true`, `Entra__Provision__Disabled=true`, `Contabilidad__Recurrentes__Deshabilitado=true` (`backend/tests/Api.IntegrationTests/TestAssemblyInit.cs`) | Un backend local que arranca consumidores/despachador de Outbox compite con la instancia desplegada en dev: apagarlos por flag |
| FiscalAPI | `tools/fiscalapi-probe/*.ps1` | **Pegan a `test.fiscalapi.com` / live con credenciales reales: NO ejecutar sin permiso explícito** |

## A+W (módulo `Millet.Integraciones.Aw`, esquema `integraciones_aw`)
Tres flujos independientes que **no se mezclan** (ADR-0048, CLAUDE.md):
1. **Cotizaciones del Glass Agent** (ERP -> A+W): EDI + drop service + correlación `aw_doc_id` (docs 00-03). Producción: **no se toca**. Workers `AwDropWorker`, `AwCorrelationWorker`/`AwLateReconciliationWorker`.
2. **Pedidos en firme para facturación** (A+W -> ERP): tabla-puente `dbo.aw_solicitud_pedido` + vistas `vw_erp_*` en la BD on-prem `MILLET_INTEGRACION` (dev: `MILLET_INTEGRACION_DEV`), doc 04. Código en `Integraciones.Aw/{Application,Infrastructure}/Pedidos/`. Workers `AwSolicitudesWorker`, `WriteBackResultadoWorker`.
3. **A+W OTR** (envíos de contenedores con Comercio Exterior), doc 09: `Infrastructure/Exportacion/`; tablas puente `aw_otr_envio`, `aw_otr_envio_linea`, `erp_otr_estado`. Entrada/salida apagadas por omisión; conexión real solo tras I13.4 firmado. No es una compra.
Transporte: Azure Relay **Hybrid Connection** (`hc-aw-business-sql` -> SER-DATA:1433, `hc-aw-drop-service` -> SER-DATA:5000), definidas en `infra/modules/hybridConnections.bicep`.

**Anti-scope:** no genera EDI (lo construye el Glass Agent y el ERP lo trata como binario opaco); no tiene lógica de vidrio (medidas, templado, corte); no modifica tablas internas de A+W; solo escribe en tablas puente definidas por el ERP (ver Contradicciones).
**Candados de ambiente (ADR-0048 D7):** dev/qa apuntan a `MILLET_INTEGRACION_DEV`; `Facturacion:Workers:AwSolicitudes:EmpresaId` vacío => el worker no procesa; sin `ConnectionStrings:AwIntegracionDb` => quedan los stubs (`StubAwSolicitudesReader`, `StubAwWriteBackPort`). Clientes usan `ConnectionStrings:AwClientesDb` y flags propios; habilitar clientes no activa pedidos.
**Seguridad A+W:** solo SELECT sobre lo necesario, cuenta de servicio, TLS verificado (no copiar `Encrypt=False`), sin exponer SQL a internet.
Dependencias de ensamblado: `Integraciones.Aw -> Facturacion` y `-> ComercioExterior` (nunca al revés). Glass Agent autentica con service principal de Entra (client credentials) y cambia el token por JWT del API en `POST /api/auth/sesion` (D3).

## CFDI 4.0 y PAC (FiscalAPI)
- ADR-0038 (estado **Propuesta**, reemplaza ADR-0027/OneFactura): FiscalAPI = PAC único para descarga, timbrado, cancelación y consulta. Puerto único `IFiscalApiClient` en `Integraciones.Fiscal/Domain`; no introducir `IPacProvider`.
- El **XML CFDI lo construye y sella el ERP** con la CSD de Millet (Key Vault); FiscalAPI agrega el TFD. ApiKey por empresa en `integraciones_fiscal.configuracion_pac`, cifrada (DataProtection, ADR-0037; DEK en KV, ring en Blob).
- Descarga masiva SAT es **asíncrona** (solicitud -> paquetes tras horas -> polling ~30 min): no modelarla como llamada síncrona (`modulos/integraciones-fiscal/02-flujo-asincrono.md`). El SDK oficial apunta a `live.fiscalapi.com` en todos los ambientes; el sandbox no soporta el flujo completo.
- Errores normalizados con códigos neutros (`CFDI_DUPLICADO`, `XML_INVALIDO`...). Reglas fiscales de producto por `BA_PRODUKTART` (VID80000-VID80003) solo completan campos vacíos.
- Timbrar/cancelar = efecto irreversible externo: siempre `@no-dev` en verificación (ver `millet-qa`). Datos fiscales incompletos de cliente no bloquean el alta, **bloquean el timbrado**.

## Service Bus + Outbox + idempotencia
- Estado y evento en la misma TX (Outbox, `integration_events_outbox` por esquema); `OutboxPublisherWorker<TDbContext>` publica con `SELECT ... FOR UPDATE SKIP LOCKED`; `correlation_id` viaja como propiedad del mensaje. Tóxico tras >10 intentos.
- Consumo at-least-once: tabla de eventos procesados (ej. `almacen.eventos_procesados`) en la misma TX del efecto. Mismo evento dos veces = un efecto.
- HTTP entrante: `Idempotency-Key` UUID v4 (ADR-0020, `core.idempotency_keys`): mismo key+body => respuesta cacheada; en curso => 409 `IDEMPOTENCY_IN_PROGRESS`; mismo key con body distinto => 422 `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BODY`.
- Topics/subscriptions en `infra/modules/servicebus.bicep`: nuevo consumidor = nueva subscription del mismo topic, no topic nuevo.
- Convenciones y triada: skills `millet-modular-monolith` y `millet-triada`.

## Graph mailbox (`Millet.Integraciones.Mailbox`, esquema `integraciones_mailbox`)
- Solo Microsoft Graph (no IMAP); auth Entra por **certificado** guardado en Key Vault (la BD guarda `certificate_keyvault_name` + `certificate_thumbprint`); una configuración por (empresa, `purpose`).
- Puerto inverso `IMailboxMessageHandler`: lo implementan los consumidores (CxP `CfdiRecibidosMailboxHandler`); worker `MailboxIngestionWorker` (`IHostedService`); dedupe en `MensajeProcesado`.
- Correo saliente: ACS Email vía `IEmailSender` con outbox (ADR-0026). Nunca enviar real en pruebas.

## Entra ID
ADR-0049: Entra **solo autentica**; usuarios, empresas, roles y permisos viven en el ERP (`UsuarioEmpresaRol`, `oid` como vínculo en `identidad.usuarios`). No usar grupos/roles de aplicación de Entra para autorizar. Usuario nuevo = sin empresas ni permisos hasta asignación explícita. Pruebas de aceptación no requieren crear grupos ni roles en Entra.

## Checklist
- [ ] Ninguna llamada a servicio externo real; flags/stubs/emuladores usados; `Entra__Proveedor=Simulado`.
- [ ] Workers de la integración apagables por flag y apagados en pruebas locales.
- [ ] Sin escritura hacia tablas internas de A+W (`rg` sobre el diff); solo tablas puente del ERP.
- [ ] Consumidor idempotente con prueba de entrega doble.
- [ ] Mutación entrante con `Idempotency-Key`.
- [ ] Secretos en Key Vault / user-secrets; cifrado ADR-0037 donde aplique.
- [ ] Efectos externos o irreversibles marcados `@no-dev`.
- [ ] Todo stub con `PLATFORM-TODO(<id>)` + fila en el doc del módulo.

## Contradicciones en los docs (marcadas, no resueltas)
- A+W "solo lectura / sin escritura" (`CLAUDE.md` Anti-scope, `project-test-rules.md`) vs ADR-0048 D3: el ERP **escribe de vuelta** (claim, `resultado`, `uuid`, `estado_facturacion`) en `aw_solicitud_pedido`, y en las tablas puente OTR. Lectura estricta: nada en tablas internas de A+W; escritura permitida solo en tablas puente del ERP (Adenda CE-04). Confirmar con el owner si se duda.
- `00-system-overview` D2: no mergear a `main` sin Hybrid Connection operando; ADR-0048 afirma que la HC ya opera en producción para cotizaciones. Estado real por confirmar.
- ADR-0038 sigue "Propuesta" aunque `Integraciones.Fiscal` ya implementa FiscalAPI; ADR-0027 (OneFactura) figura reemplazado.
- ADR-0003 (Entra para identidad y autorización, `CLAUDE.md`) vs ADR-0049 (Entra solo autentica).
- `00-system-overview` dice drop service .NET 8 y ADR-0036 .NET 8; el backend es .NET 10.
