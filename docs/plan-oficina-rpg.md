# Plan: oficina RPG

Rama `feature/oficina-rpg` (worktree `../Oficina-virtual.rpg`). Punto de control: tag `checkpoint-pre-rpg` sobre `main`.
Volver atrás: `git -C ~/Proyectos/Oficina-virtual worktree remove ../Oficina-virtual.rpg && git branch -D feature/oficina-rpg`
(main nunca se tocó; el servicio en :4777 sigue sirviendo `main`).

## Fases

1. **Design system completo**: escalas de radio, letra, capas (z), elevación, foco, velo, color de información;
   temas por `data-tema` (claro, oscuro, auto y cuatro aspectos de juego: Halo, Cyberpunk, Doom, Minecraft); la escena
   toma sus colores de los tokens. Un solo estilo por rol (botón de peligro, pestañas, medidor de progreso) y fuera los
   hex y `style={{}}` sueltos. Referencia en `docs/design-system.md`.
2. **Personalización RPG (Armería)**: cada rol y cada sesión tienen su equipo: clase (casco o accesorio en el sprite),
   colores, apodo. Se guarda en SQLite (`aspectos`), llega en `/api/estado` y la escena lo dibuja. Vista previa en vivo.
3. **Agentes especializados**: prompts reescritos con las guías de Anthropic, `skills:` por rol, rol nuevo
   `integracion`. Skills propias del ERP Millet en `skills/` (no se instalan en el repo del ERP sin permiso).
4. **Tokens**: modelo y esfuerzo por rol, uso de tokens por sesión a la vista (HUD), bucle del canvas que duerme cuando
   nada se mueve, menos re-renders.
5. **Flujos**: misiones (cadena de roles plan → implementación → QA → docs) con regreso a implementación si QA rechaza.
6. **Extras**: niveles y logros por rol según encargos entregados; retrato estilo Doom en la ficha que reacciona al
   estado y al contexto.
