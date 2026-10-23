// Solo desarrollo (main.tsx la monta detrás de import.meta.env.DEV): `/?galeria` muestra a todo el reparto del tema en
// cada pose, con los mismos retratos que la Armería, para revisar kits y animaciones de un vistazo. `&tam=160` agranda.
import { Retrato } from '@/components/retrato'
import type { RolId } from '@/lib/tipos'
import { aplicarTema, TEMAS, useTema, type TemaId } from '@/lib/tema'
import { actorDe, type Actor } from './personajes'
import { aspecto, CLASES, YO_FABRICA, type Pose } from './sprites'

const POSES: Pose[] = ['parado', 'camina', 'teclea', 'espera', 'mano', 'triste', 'duerme', 'entrega', 'cafe']
const ROLES: RolId[] = ['analisis-plan', 'implementacion', 'revision-qa', 'diseno', 'docs-entrega', 'integracion']

export function Galeria() {
  const tema = useTema()
  const tam = Number(new URLSearchParams(location.search).get('tam')) || 96
  const filas: { titulo: string; actor: Actor; a: ReturnType<typeof aspecto> }[] = [
    { titulo: 'yo', actor: 'yo', a: aspecto('yo', YO_FABRICA) },
    ...ROLES.map((r) => ({ titulo: r, actor: actorDe(null, r), a: aspecto(`rol:${r}`, null, null, r) })),
    ...['fondo-1', 'fondo-2', 'fondo-3'].map((id) => ({ titulo: id, actor: 'fondo' as Actor, a: aspecto(id) })),
    ...(Object.keys(CLASES) as (keyof typeof CLASES)[]).map((c) => ({ titulo: `clase ${c}`, actor: 'fondo' as Actor, a: aspecto(`c-${c}`, { clase: c }) })),
  ]
  return (
    <div style={{ padding: 16, background: 'var(--fondo)', color: 'var(--texto)', minHeight: '100vh' }}>
      <select value={tema} onChange={(e) => aplicarTema(e.target.value as TemaId)} aria-label="Tema">
        {Object.entries(TEMAS).map(([k, t]) => <option key={k} value={k}>{t.titulo}</option>)}
      </select>
      <table style={{ borderSpacing: 6, marginTop: 12 }}>
        <thead><tr><th />{POSES.map((p) => <th key={p}>{p}</th>)}</tr></thead>
        <tbody>{filas.map((f) => (
          <tr key={f.titulo}><th style={{ textAlign: 'right', fontSize: 12 }}>{f.titulo}</th>
            {POSES.map((p) => <td key={p}><Retrato aspecto={f.a} actor={f.actor} pose={p} tam={tam} /></td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  )
}
