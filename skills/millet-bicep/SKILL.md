---
name: millet-bicep
description: Usar al editar o desplegar infraestructura Bicep del Millet ERP (infra/): módulos, parámetros por ambiente, nombres y tags de recursos Azure, Key Vault, Service Bus, Hybrid Connections, y el flujo validate / what-if / create. Regla: nunca desplegar sin what-if previo y sin permiso.
---

# Bicep / Azure (carpeta `infra/`)

Fuentes: `CLAUDE.md` (Convenciones de Bicep, Comandos de despliegue, Notas), `infra/README.md`, `infra/main.bicep`, `infra/modules/*.bicep`, `.github/workflows/validate-infra.yml`, `deploy-infra-dev.yml`.
Skill `azure-deployment-preflight` (política `.claude/skills-policy.md`): cada uso llama a Azure y requiere permiso explícito cada vez.

## Reglas
- **Secretos jamás** en código, `.bicepparam`, `appsettings` ni commits: Azure Key Vault + `az.getSecret()` desde Bicep.
- **Siempre `what-if` antes de `create`** en cualquier ambiente que no sea un sandbox personal; en `prod`, además segundo par de ojos. Nunca `az deployment sub create` sin haber visto el what-if.
- Cualquier `az` (validate incluido) es contacto con Azure real: pedir permiso explícito en el chat antes de ejecutar; un deploy real jamás por iniciativa propia.
- Parametrización por ambiente en `infra/parameters/{dev,prod}.bicepparam` (nunca valores de ambiente hardcodeados en módulos).
- Abrir VS Code/Claude en la raíz del monorepo; leer `infra/README.md` antes de cambios grandes.
- Ramas `feature/ fix/ chore/ docs/`; no commit sin permiso del owner.

## Estructura
`infra/main.bicep` (scope subscription) + `infra/modules/`: `appservice`, `database` (PostgreSQL Flexible Server), `keyvault`, `keyvault-secrets`, `servicebus`, `hybridConnections`, `relay`, `signalr`, `staticwebapp`, `storage`, `registry`, `network`, `rbac`, `monitoring`, `monitoring-alerts`, `budget`. `infra/main.json` es la compilación (no editar a mano).

## Nombres y tags
- Patrón `{tipo}-{proyecto}-{ambiente}-{región}-{secuencia}`; región `mxc` (México Central, `location = mexicocentral`). Ejemplos reales en el código: `kv-millet-dev-mxc-01`, `pg-millet-dev-mxc-01` (database.bicep), `sb-millet-dev-mxc-01` (servicebus.bicep), `rg-millet-dev-mxc-01`.
- Storage solo minúsculas y dígitos sin guiones, máx 24 (`stmilletdevmxc01`); Container Registry alfanumérico (`crmilletdevmxc01`).
- Tags aplicados en `main.bicep:125-130`: `Project: '<proyecto>-erp'`, `Environment`, `Owner` (eduardo.paredes@tiglass.net), `CostCenter`, `CreatedBy: 'bicep'`, `DataClassification: 'internal'`.

## Comandos (copiados de `CLAUDE.md` / `infra/README.md`)
```bash
az login && az account set --subscription "<NOMBRE>"
az deployment sub validate --location mexicocentral --template-file infra/main.bicep --parameters infra/parameters/dev.bicepparam
az deployment sub what-if  --location mexicocentral --template-file infra/main.bicep --parameters infra/parameters/dev.bicepparam
az deployment sub create   --location mexicocentral --template-file infra/main.bicep --parameters infra/parameters/dev.bicepparam --name "deploy-millet-dev-$(date +%Y%m%d-%H%M%S)"
```
- `postgresAdminPassword` se resuelve solo por `az.getSecret()` del secreto `postgres-admin-password` del Key Vault; los comandos **no** llevan la password. Solo en el **bootstrap** de un ambiente nuevo (KV inexistente): `--parameters postgresAdminPassword='<PASSWORD>'` en los 3 comandos.
- **Trampa conocida (incidente 2026-07-07):** `what-if` NO detecta cambios de password (`administratorLoginPassword` es write-only); un deploy sin override reseteó el password de `pgadmin` y tumbó la app (28P01 en loop).
- Destruir: `az group delete --name rg-millet-dev-mxc-01 --yes --no-wait` y `az keyvault purge ...` (solo dev, con permiso).

## CI
- `validate-infra.yml`: en PR, `az deployment sub validate` + `what-if`, comenta el resumen en el PR y sube el detalle como artifact.
- `deploy-infra-dev.yml`: solo `workflow_dispatch` (OIDC); publicar el repo no debe crear ni cambiar infraestructura.

## Service Bus y Hybrid Connections (puntos que tocan código)
- `servicebus.bicep` define topics/subscriptions que consumen los listeners (`compras-events`, `almacen-events`, etc.). Consumidor nuevo = **subscription nueva del mismo topic**, no topic nuevo. Antes de aplicar un topic que ya existe en un ambiente, leer el comentario del módulo (riesgo de conflicto). El emulador local se genera desde este Bicep (`tools/servicebus-emulator/generar-config.py`): regenerar tras cambiarlo.
- `hybridConnections.bicep`: `hc-aw-business-sql` (SER-DATA:1433) y `hc-aw-drop-service` (SER-DATA:5000). Cada HC crea reglas SAS que el HCM on-prem usa; no incluir sus llaves en repo.
- SKU: dev/qa Standard, prod Premium para Service Bus.

## Checklist
- [ ] Parámetros en `.bicepparam`, ningún secreto ni valor de ambiente en módulos.
- [ ] Nombres y tags según el patrón.
- [ ] `validate` y `what-if` revisados (con permiso) y adjuntos al reporte; para cambios de password, verificación manual (what-if no lo ve).
- [ ] Sin deploy real sin autorización explícita; prod con revisión de segunda persona.
- [ ] Si cambió Service Bus: regenerar config del emulador y revisar suscriptores en `backend/src/*/Infrastructure/Workers/`.

## Contradicciones en los docs
- `CLAUDE.md` da tags `project=millet, environment, owner, costCenter, managedBy=bicep` (minúsculas) y recurso `psql-millet-prod-mxc-01`; `infra/README.md` y `main.bicep` usan `Project=millet-erp`, `CreatedBy=bicep`, `DataClassification`, y `pg-...`. Manda el código (`main.bicep`, `database.bicep`).
- `infra/README.md` indica PostgreSQL v16; `backend/tools` aislado usa postgres:17-alpine (solo pruebas). No mezclar al actualizar versión.
- `infra/README.md` describe Fase 0 sin Service Bus/Container Apps ("Fase 1 se agregará"); el Bicep ya incluye Service Bus, Relay, SignalR y Static Web Apps. El README está desactualizado.
