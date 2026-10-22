# Investigación: skills, orquestación, tokens y prompts (2026-10-21)

Fuentes revisadas el 2026-10-21 (repos verificados con `gh api`, URLs con HTTP 200). Lo que es propuesta propia va
marcado como tal.

## 1. Skills por rol

Regla del ERP Millet (`.claude/skills-policy.md` de su repo): **no** instalar `frontend-design`, `webapp-testing` ni
`playwright` (duplican su arnés de verificación) ni skills comunitarias de arquitectura .NET. Lo de abajo respeta eso.

### Diseño (rol `diseno`)
| Skill | Para qué | Instalar |
|---|---|---|
| ui-ux-pro-max (ya instalada) | estilos, paletas, tipografía, design system, shadcn | — |
| `millet-ui-design-system` (este repo) | tokens, Plex, patrón Compras del ERP | `node scripts/instalar-skills.js <erp>/.claude/skills` |
| impeccable, emil-design-eng, break-ui (ya en el ERP) | revisar lo diseñado | — |
| gsap-skills (GreenSock, oficial) | animación con GSAP | `/plugin marketplace add greensock/gsap-skills` → `/plugin install gsap-skills@gsap-skills` |
| web-quality-skills (Addy Osmani) | Core Web Vitals, rendimiento, a11y | `/plugin marketplace add addyosmani/web-quality-skills` → `/plugin install web-quality-skills@addy-web-quality-skills` |
| vercel-labs/agent-skills | react-best-practices, react-view-transitions | `npx skills add vercel-labs/agent-skills` |
| ui-design (wshobson) | design-system-patterns, interaction-design, accessibility | `/plugin marketplace add wshobson/agents` → `/plugin install ui-design@claude-code-workflows` |

### QA (rol `revision-qa`)
| Skill | Para qué | Instalar |
|---|---|---|
| `millet-qa` (este repo) | xUnit, Vitest/MSW, arnés Playwright del ERP | script de arriba |
| superpowers (obra) | TDD, systematic-debugging, verification-before-completion, code review | `/plugin marketplace add obra/superpowers-marketplace` → `/plugin install superpowers@superpowers-marketplace` |
| code-review, pr-review-toolkit, security-guidance (oficiales) | revisión multiagente, seguridad | `/plugin install <nombre>@claude-plugins-official` |
| trailofbits/skills | differential-review, insecure-defaults, property-based-testing | `/plugin marketplace add trailofbits/skills` |

### Integración (rol `integracion`)
| Skill | Para qué | Instalar |
|---|---|---|
| `millet-integraciones`, `millet-modular-monolith` (este repo) | A+W, CFDI/Fiscalapi, Service Bus + Outbox, Graph, Entra | script de arriba |
| dotnet/skills (Microsoft) | dotnet-aspnetcore, dotnet-data, dotnet-test, dotnet-diag | `/plugin marketplace add dotnet/skills` → `/plugin install dotnet-aspnetcore@dotnet-agent-skills` |
| supabase-postgres-best-practices (ya en el ERP) | Postgres | — |
| csharp-lsp, typescript-lsp (oficiales) | ir a la definición en vez de grep + leer archivos: ahorra tokens | `/plugin install csharp-lsp@claude-plugins-official` |

### Prompts y contexto
- context-engineering: `/plugin marketplace add muratcankoylan/Agent-Skills-for-Context-Engineering` → `/plugin install context-engineering@context-engineering-marketplace`
- skill-creator (oficial, `anthropics/skills`): mide si una skill sirve.

Recomendación (propia): instalar plugins **por proyecto** y no globales. Cada skill instalada suma su descripción al
contexto de todas las sesiones; las del ERP solo deben cargar en el ERP.

## 2. Orquestación: qué tomamos de cada sistema

| Sistema | Patrón | En la oficina |
|---|---|---|
| Anthropic multi-agent research | orquestador + trabajadores en paralelo; devuelven referencias, no volcados | encargos con `ENTREGA:` breve |
| Subagentes de Claude Code | contexto aislado; `model`, `tools`, `skills`, `isolation: worktree` por rol | `agentes/*.md` con modelo por rol |
| Agent teams (experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) | lista de tareas compartida con dependencias, bandeja entre compañeros | **misiones** (cadena de roles) |
| LangGraph | grafo con estados y reanudación tras fallo; `interrupt()` para aprobar | encargos en SQLite con estado |
| OpenAI Agents SDK | handoffs explícitos y guardrails en paralelo | la entrega pasa al siguiente rol |
| Claude Squad / vibe-kanban / Conductor | un worktree por tarea, revisión del diff antes de integrar | «Nueva sesión» ya propone el worktree |
| superpowers subagent-driven-development | implementador y revisor distintos; se cierra solo con evidencia | QA rechaza → vuelve a implementación una vez |

Pendiente propuesto: Claude Agent SDK para lanzar roles sin teclear en tmux (control programático y costo medido).

## 3. Gasto de tokens (docs oficiales de Claude Code: costs y prompt-caching)

- Modelo por rol: Sonnet por defecto, Opus solo para plan y arquitectura, Haiku para documentación y tareas simples.
  **Hecho**: `model:` del frontmatter de cada rol ahora se usa al lanzar su sesión (`server/encargos.js` → `fichaRol`).
- El Explore integrado hereda el modelo principal: un agente de proyecto llamado `Explore` con `model: haiku` lo abarata.
- La caché coincide con el prefijo exacto. La rompen: cambiar de modelo, de esfuerzo, activar fast mode, agregar un MCP sin
  tool search, compactar. No la rompen: editar CLAUDE.md (aplica tras `/clear`), usar skills, cambiar permisos, lanzar subagentes.
- TTL: la conversación principal tiene 1 h con suscripción; subagentes y compañeros, 5 min. Para roles que esperan
  entre encargos: `subagentPromptCacheTtl: "1h"` en settings.
- Contexto: CLAUDE.md < 200 líneas; lo de flujo a skills (SKILL.md < 500 líneas; descripción ≤ 1 536 caracteres).
- Salida de herramientas: un hook PreToolUse que filtre las pruebas a `grep FAIL | head -100` baja decenas de miles de
  tokens a cientos. Los roles de QA ya lo piden en su prompt.
- `/usage` muestra la tasa de caché y qué la rompe. `/clear` entre tareas no cuesta; `/compact` es una petición grande.
- **Hecho**: la oficina mide tokens por sesión (entrada, caché leída y creada, salida) y el porcentaje de caché (`gastos` en `/api/estado`).

## 4. Diez reglas para prompts de agentes (Anthropic: prompting best practices, context engineering, writing tools)

1. Altura correcta: heurísticas claras, no reglas if/else frágiles; empezar mínimo y agregar una línea por fallo visto.
2. Explicar el porqué de cada regla.
3. Cada encargo lleva objetivo, formato de salida, herramientas, límites y condición de cierre.
4. Sin MAYÚSCULAS ni «CRÍTICO/DEBES»: los modelos actuales sobrerreaccionan.
5. Decir cuándo delegar y cuándo no (Opus tiende a lanzar subagentes de más).
6. Bloque contra sobreingeniería: alcance, sin archivos ni abstracciones extra.
7. Verificar antes de dar por hecho: correr pruebas, nunca editarlas para que pasen.
8. Estado en disco (notas, plan, git): el contexto se compacta.
9. Regla de reversibilidad: lo local y reversible, adelante; push, borrar, sistemas externos, preguntar.
10. Pocos ejemplos canónicos y salida corta (rutas y referencias, no volcados).

**Hecho**: los seis roles de `agentes/` se reescribieron con estas reglas.

## 5. Ideas de juego (patrones de HUD; el mapeo a métricas es propuesta propia)

| Juego | Patrón | Métrica del agente |
|---|---|---|
| Halo | barra de escudo que se recarga | contexto libre (se recarga con `/compact`) |
| Halo | radar de movimiento / waypoints | flecha al agente que espera permiso |
| Cyberpunk 2077 | escáner con colores por tipo | tarjeta al señalar: rol, tarea, modelo, gasto |
| Cyberpunk 2077 | menú de quickhacks con costo en RAM | acciones con su costo en tokens |
| DOOM | cara de la barra de estado según la salud | retrato que empeora con el contexto y los errores |
| DOOM | contadores grandes de munición | tokens, caché %, respuestas |
| Minecraft | hotbar de 9 casillas | skills equipadas del rol (**hecho** en la Armería) |
| Minecraft | barra de XP y logros | nivel por encargos entregados (**hecho**) |

Proyectos parecidos: Pixel Agents (`pablodelucca/pixel-agents`, editor de distribución de la oficina), Claude Office
Visualizer (`paulrobello/claude-office`: bote de basura que se llena con el contexto, pizarrón con modos), AI Town
(registro de eventos aparte), git-gamify (tope diario de XP para que no se «farmee»).

Accesibilidad en estilo juego: nada que parpadee más de 3 veces por segundo (WCAG 2.3.1); sin scanlines, glitch ni
temblor con `prefers-reduced-motion`; neón sobre negro pasa contraste, neón sobre neón no; letra de píxel solo en títulos y números.

Fuentes de Google Fonts por tema (propuesta): Halo → Orbitron / Share Tech Mono; Cyberpunk → Rubik Glitch (solo títulos) /
Doto; DOOM → Jersey 10 / Bungee; Minecraft → Pixelify Sans (ya cargada) / Silkscreen.

## 6. Contradicciones encontradas en la documentación del ERP Millet

Las encontró el agente que escribió las skills de `skills/` (solo leyó el repo del ERP):

1. ADR-0016 pide Testcontainers e integración en cada PR; no hay paquete Testcontainers (el script levanta docker postgres:17) y el CI solo corre pruebas unitarias.
2. `backend/README.md` dice 12 contextos de migración; `tools/migration-contexts.txt` lista 14.
3. Rama base: `verify-task.md` dice `origin/develop`; `project-test-rules.md` y `CLAUDE.md` dicen `main`.
4. DESIGN.md §10 manda copiar `tailwind.config.ts`; `frontend/AGENTS.md` dice que no (Tailwind 4).
5. Sheet: 560 px en DESIGN.md contra `max-w-3xl` en `patrones-compras.md`, que además usa `amber-*` contra la regla de tokens.
6. Breadcrumbs: DESIGN.md §3.3 los pone en el topbar; `patrones-compras.md` §6.7 dice que las bandejas no los muestran.
7. ADR-0017 prescribe `api-types.ts` generado (`npm run codegen`); no existe: los DTO se copian a mano.
8. ADR-0036 ubica reportes en `components/reportes/<modulo>/`; el código está en `components/erp/reportes/` (y `clave/etiqueta` en vez de `key/label`).
9. A+W «solo lectura» (`CLAUDE.md`) contra ADR-0048 D3, donde el ERP escribe en las tablas puente.
10. ADR-0003 (Entra autentica y autoriza) contra ADR-0049 (solo autentica); ADR-0049 habla de varias empresas y ADR-0051 de una.
11. ADR-0038 (FiscalAPI) sigue «Propuesta» aunque ya está implementado; ADR-0030 «pendiente de ratificación» pero se aplica.
12. ADR-0009: eventos en `Application/IntegrationEvents/` y tabla `integration_events_processed`; el código usa `Domain/...` y `almacen.eventos_procesados`.
13. ADR-0036 y el overview de integración dicen .NET 8; el backend es .NET 10.
14. Bicep: prefijos y tags de `CLAUDE.md` (`psql-`, `managedBy`) distintos de `main.bicep` (`pg-`, `CreatedBy`).
15. `00-system-overview` D2 dice no mergear sin Hybrid Connection; ADR-0048 dice que ya opera en producción.
