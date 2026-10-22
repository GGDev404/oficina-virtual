---
name: millet-qa
description: Usar para probar o verificar cambios del Millet ERP: tests xUnit/FluentAssertions de backend, integración aislada, Vitest/MSW/axe del frontend, arnés Playwright (VERIFY_ENV/VERIFY_TASK, specs en e2e/verify), qué corre el CI, entornos test/dev, tags @evidence/@no-dev y reglas de evidencia.
---

# Millet ERP: cómo probar aquí

Fuentes: `.claude/project-test-rules.md` (reglas que la verificación debe comprobar), `.claude/commands/verify-task.md`, `backend/README.md`, `.github/workflows/validate-app.yml`, ADR-0016, `playwright.verify.config.ts`, `e2e/verify/_template/plantilla.example.ts`, `frontend/vitest.config.ts`.
Primero lee `millet-integraciones` (regla dura: nunca sistemas externos reales).

## Backend
- Stack real: xUnit + FluentAssertions + NSubstitute + Bogus (+ Verify para snapshots XML/PDF/JSON complejos) — ADR-0016. Proyectos: `backend/tests/<Modulo>.UnitTests/`, `Api.IntegrationTests/`, `Compras.IntegrationTests/`, `Integraciones.Aw.IntegrationTests/`.
- Naming: `Should_Comportamiento_When_Escenario` o `Metodo_Escenario_Resultado`; `// arrange // act // assert` si no es trivial. Tiempo vía `TestClock`/`IClock` (nunca `DateTime.Now`).
- **Prohibido `Microsoft.EntityFrameworkCore.InMemory`** (no respeta query filters ni constraints). Integración = PostgreSQL real.
- Build y unitarias (desde la raíz):
```bash
dotnet restore backend/Millet.sln
dotnet build backend/Millet.sln --configuration Release --no-restore   # warnings = errores (Directory.Build.props)
dotnet test backend/tests/<Modulo>.UnitTests/<Modulo>.UnitTests.csproj  # por proyecto
```
- **No** correr `dotnet test` sobre toda la solución contra una BD de desarrollo (incluye suites que exigen el entorno aislado). Integración:
```bash
./tools/validate-integration-isolated.sh                       # PostgreSQL temporal (docker postgres:17-alpine), aplica los contextos de tools/migration-contexts.txt, corre 3 suites; se niega a correr contra una BD de dev normal
./tools/validate-integration-isolated.sh --filter ...          # subconjunto (ADR-0016 / TestAssemblyInit)
./tools/validate-integration-isolated.sh --comercio-exterior   # CE-01a con EntraId y JWT firmado
```
  Requiere Docker. `TestAssemblyInit` apaga Outbox/workers y fija `Entra__Proveedor=Simulado`, `Auth__Mode=FakeForLocalDev`.
- Obligatorio al agregar entidad `IPerteneceAEmpresa`: suite `TenantIsolationTests` (SELECT/INSERT/UPDATE/FK/Bypass) — ADR-0016. `EmpresaContext.Bypass()` solo en `tests/`, `Migrations/`, `Seed/`.
- Pruebas de folios por sucursal: usar una sucursal seedeada dedicada, no la canónica (ADR-0016).
- Pruebas de eventos: Outbox inserta en la misma TX; entrega doble = un efecto.
- Reglas del repo auditables por `rg`: Nullable, sin `.Result/.Wait()`, `record` DTOs, `sealed`, FluentValidation (no Data Annotations), Mapster (no AutoMapper), Serilog.

## Frontend (`frontend/`)
```bash
npm run build        # tsc -b tsconfig.app.json tsconfig.node.json && vite build
npm run lint         # eslint .
npm test             # vitest run (jsdom, globals, setup src/test/setup.ts, testTimeout 15 s)
npm run test:coverage   # threshold 70/70/60/60 solo en src/features/compras/**
npm run typecheck:test  # tsc -b tsconfig.test.json
```
- Tests junto al código: `*.test.ts(x)`; páginas `*.smoke.test.tsx` con los 4 estados (loading/empty/data/error).
- **MSW** (`src/test/mocks/server.ts`, `mswServer`) mockea HTTP en pruebas de hooks/páginas; `createQueryWrapper()`/`test-query-client.tsx` da QueryClient. Router: `vi.mock('@tanstack/react-router')` en smoke tests. Radix Dialog/Select en jsdom: pruebas pragmáticas (`findByRole`), el flujo completo se cubre en E2E.
- **axe-core** con tag `wcag21aa` en al menos una pantalla por release (ej. `CubrimientoBar.test.tsx`, smoke de Almacén/Centros de costo).
- Schemas Zod: `parse` válidos e inválidos. Snapshots (`__snapshots__`) solo para salidas estables (`EstadoBadge`).

## Qué corre el CI (`.github/workflows/validate-app.yml`, en PR a `main`)
| Job | Hace |
|---|---|
| `changes` | `dorny/paths-filter`: backend/frontend |
| `build-backend` | `dotnet build` Release |
| `test-backend` | **solo unit tests** (`backend/tests/*UnitTests/*.csproj`, en paralelo); **no** integración |
| `build-frontend` / `lint-frontend` | `npm run build` / `npm run lint` |
| `test-frontend` | `vitest` en 4 shards (`--shard=N/4`); agregador `Test frontend` aún fuera de required checks |
Infra: `validate-infra.yml` (`validate` + `what-if`). Deploy: `deploy-app-dev.yml`, `deploy-infra-dev.yml` (este último solo manual, `workflow_dispatch`). E2E y codegen OpenAPI **no** corren en CI todavía. Por eso la integración aislada se corre local antes del PR.

## Arnés de verificación Playwright (E2E real, sin mocks)
Archivos: `playwright.verify.config.ts` (raíz), `e2e/_harness/`, `e2e/verify/<ID>/*.spec.ts`, `e2e/verify.config.json`, `scripts/test-env.mjs`, `scripts/login-entra.mjs`, `docker-compose.test.yml`. Plantilla: `e2e/verify/_template/plantilla.example.ts`. Comandos (siempre desde la raíz):
```bash
npx playwright test -c playwright.selftest.config.ts            # autoprueba del arnés, sin navegador
VERIFY_ENV=test VERIFY_TASK=<ID> npx playwright test -c playwright.verify.config.ts e2e/verify/<ID>   # iterar (BD Docker se recrea)
VERIFY_ENV=dev  VERIFY_TASK=<ID> npx playwright test -c playwright.verify.config.ts e2e/verify/<ID>   # evidencia: UN run final, con confirmación explícita del owner
node scripts/login-entra.mjs <rol> [--env dev]                   # sesión real de Entra por rol (guarda e2e/.auth/<env>/<rol>.json)
node scripts/test-env.mjs up|reset|down|status [--env test|dev] [--rebuild] [--dry-run]
```
Opciones: `HEADED=1` ventana visible; `BROWSER_EXECUTABLE=/usr/bin/chromium`; `VERIFY_SLOT=<1..8>` varias instancias en paralelo (backend :5100+n, Vite :5200+n, BD `millet_test_s<n>`). `workers: 1`, `retries: 0` (un flaky es un hallazgo, no se reintenta), `forbidOnly`.
Orquestación completa: comando `/verify-task <ID>` (fases 0-8) y `/dev-preflight <ID>`; agentes `test-planner`, `ui-verifier`, `gap-auditor`, `fallback-worker`.

### Entornos
- **`test`** (por defecto): backend y frontend locales + Postgres en Docker recreado desde plantilla. Aquí corre **toda** la matriz, destructivos incluidos. No toca recursos compartidos de Azure (Service Bus = emulador/en memoria/NoOp, Key Vault, Blob, BD de dev); si no se puede garantizar, **detenerse y preguntar**.
- **`dev`**: app local contra datos reales (idealmente copia desechable `<db>_evidence`, `envs.dev.copy`). Tu BD real nunca se resetea ni se toca. Solo specs `@evidence` (sin `@no-dev`).
- Quien produce la evidencia que se sube a ClickUp es siempre el **último run en dev** (`.verification/<ID>/evidence/dev/`); capturas de `test` son para depurar y no se suben.

### Tags de spec
`(sin tag)` solo test · `@evidence` también en dev (mínimo, datos `E2E-…`, con `cleanup.add`) · `@no-dev` nunca en dev (timbrado/PAC/SAT, pagos, Tesorería, pólizas y cierres, bajas de activos, correos/notificaciones reales, A+W/requisiciones externas, eventos con efecto contable) · `@responsive` también en móvil (Pixel 7).

### Reglas de evidencia y spec
- Título de test empieza con el ID de fila de la matriz (`M-01 [AC1] ...`); cada fila de regla del proyecto que no aplique = `N/A: <razón>`, nunca se omite.
- Cada rol afectado x caso **permitido y rechazado**: por UI **y** llamada directa al endpoint (403/404), más estados vacíos y de error.
- Nunca mockear en specs; nunca saltar la UI para la acción bajo prueba. Verificar cableado real con `apiCallOn(...)` (método/URL/status/payload), resultado visible concreto, persistencia tras recarga (`reloadAndExpect`) y verificación independiente del backend (`guard.api.get`). Helpers: `expectClickHasEffect`, `expectNoPlaceholders`, `guard.fault(...)` para errores 500, `shot`, `newRoleContext`.
- Solo usuarios reales de Entra (`login-entra.mjs`); prohibido FakeForLocalDev o usuarios sintéticos en E2E. `e2e/seed/identity.local.json` (gitignored) mapea usuarios reales a roles/permisos/sucursales. Falta un usuario/rol => preguntar; fila `BLOQUEADO`.
- Datos de prueba con prefijo `E2E-`; en `dev` la limpieza es obligatoria (entidades no borrables se cancelan por su flujo + `guard.dev.markCleaned()`, o el caso es `@no-dev`).
- Preflight de dev (`/dev-preflight`): destino confirmado (`expect.envVar` host+BD, se niega si parece producción); **no aplicar migraciones a dev**; apagar consumidores Service Bus y despachador de Outbox del backend local (si no existe flag, es hallazgo); declarar eventos emitidos por filas `@evidence`; `Auth__ServicePrincipalsJson` vacío; no editar frontend mientras corre el run (Vite recarga).
- Nunca decir "listo/funciona/pasa" sin haber ejecutado los tests en esta sesión y visto el resultado. Nunca debilitar un test. Máx. 3 iteraciones de corrección por bug.
- Cualquier cambio de código posterior invalida la evidencia (el SHA ya no coincide): repetir pre-PR y evidencia.

## Pre-PR (cierre)
Merge de la rama base, `./tools/validate-integration-isolated.sh` **sin filtro**, unitarias, `tsc` + Vitest si se tocó frontend, y re-ejecutar los specs de verificación en `test`. Si la base avanza, repetir todo. No commit sin permiso explícito del owner. Subir a ClickUp solo cuando lo pida (`node scripts/clickup-attach.mjs <ID> --confirm`).

## Contradicciones en los docs (marcadas, no resueltas)
- ADR-0016 prescribe Testcontainers; el repo usa un contenedor Docker lanzado por `tools/validate-integration-isolated.sh` (no hay paquete Testcontainers en `Directory.Packages.props`).
- ADR-0016 dice que la integración corre en cada PR; el CI actual corre solo unit tests y E2E no corre.
- `backend/README.md` dice 12 contextos de migración; `tools/migration-contexts.txt` lista 14.
- Rama base: `verify-task.md` Fase 6 dice `origin/develop`; `project-test-rules.md` y `CLAUDE.md` dicen `main`. Usar `main` salvo indicación del owner.
- ADR-0016 y `patrones-compras.md` mencionan Playwright E2E como "pocos y nocturnos"; el repo tiene un arnés de verificación por tarea (`e2e/verify`) más amplio que ese diseño.
