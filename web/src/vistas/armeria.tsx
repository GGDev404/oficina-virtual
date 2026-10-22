// Armería: equipo de cada personaje (clase, colores, apodo), nivel de los roles, modo de trabajo de cada rol (modelo,
// permisos, skills e instrucciones) y tema de la oficina.
// El equipo de un rol lo hereda cada sesión de ese rol; el de una sesión manda sobre el de su rol.
import { useEffect, useMemo, useState } from 'react'
import { BotonAccion } from '@/components/comunes'
import { useOficina } from '@/components/contexto'
import { Panel, Pestanas } from '@/components/pestanas'
import { Retrato } from '@/components/retrato'
import { Cerrar, Descripcion, Titulo, Ventana } from '@/components/ventana'
import { actorDe } from '@/escena/personajes'
import { aspecto, CLASES, RASGOS, YO_FABRICA } from '@/escena/sprites'
import { leer, post } from '@/lib/api'
import { nombreSesion, VIVOS } from '@/lib/oficina'
import { aplicarTema, TEMAS, temaGuardado, type TemaId } from '@/lib/tema'
import type { AspectoGuardado, Clase, Datos, RolId } from '@/lib/tipos'

// Nivel: cada encargo entregado da 100 XP y cada fallo quita 25; el nivel n empieza en (n-1)² × 100 XP.
export function nivelDe(d: Datos, rol: RolId | null | undefined) {
  const e = d.experiencia?.find((x) => x.rol === rol)
  const hechos = e?.hechos ?? 0, fallos = e?.fallos ?? 0
  const xp = Math.max(0, hechos * 100 - fallos * 25)
  const nivel = Math.floor(Math.sqrt(xp / 100)) + 1
  const desde = (nivel - 1) ** 2 * 100, hasta = nivel ** 2 * 100
  const logros = [
    hechos >= 1 && 'Primera entrega', hechos >= 10 && 'Veterano', hechos >= 5 && fallos === 0 && 'Impecable', hechos >= 50 && 'Leyenda',
  ].filter(Boolean) as string[]
  return { nivel, xp, pct: (xp - desde) / (hasta - desde), falta: hasta - xp, hechos, fallos, logros }
}

type Grupo = 'yo' | 'agentes' | 'orquestan'
type Pestana = Grupo | 'tema'
const SUBTITULO: Record<Grupo, string> = { yo: '', agentes: 'Roles que reciben encargos, con sus sesiones vivas', orquestan: 'Tus sesiones de tarea: dirigen y encargan a los agentes' }

const COLORES: [keyof AspectoGuardado, string][] = [['camisa', 'Armadura o camisa'], ['brillo', 'Visor y luces'], ['pelo', 'Pelo'], ['piel', 'Piel'], ['pantalon', 'Pantalón']]

export function Armeria({ inicial }: { inicial?: string }) {
  const { datos: d, tareas, cerrarVentana } = useOficina()
  const objetivos = useMemo(() => [
    { clave: 'yo', titulo: 'Tú', sub: 'Tu avatar en tu oficina', rol: null as RolId | null, grupo: 'yo' as Grupo },
    // Agentes de apoyo: cada rol seguido de sus sesiones vivas (reciben encargos).
    ...d.roles.flatMap((r) => [
      { clave: `rol:${r.id}`, titulo: r.titulo, sub: 'Rol: lo heredan sus sesiones', rol: r.id, grupo: 'agentes' as Grupo },
      ...d.sesiones.filter((s) => VIVOS.has(s.estado) && s.rol === r.id)
        .map((s) => ({ clave: `sesion:${s.id}`, titulo: nombreSesion(s, tareas), sub: `Sesión de ${r.titulo}`, rol: s.rol, grupo: 'agentes' as Grupo })),
    ]),
    // Sesiones que orquestan: las tuyas, sin rol; encargan trabajo a los agentes.
    ...d.sesiones.filter((s) => VIVOS.has(s.estado) && !s.rol)
      .map((s) => ({ clave: `sesion:${s.id}`, titulo: nombreSesion(s, tareas), sub: 'Solo esta sesión', rol: s.rol, grupo: 'orquestan' as Grupo })),
  ], [d.roles, d.sesiones, tareas])
  const [elegida, setClave] = useState(inicial && objetivos.some((o) => o.clave === inicial) ? inicial : 'yo')
  const [pestana, setPestana] = useState<Pestana>(objetivos.find((o) => o.clave === elegida)?.grupo ?? 'yo')
  const [sub, setSub] = useState('apariencia')
  // Si su sesión se cerró, pasa a la primera de la pestaña (o a «Tú»).
  const obj = objetivos.find((o) => o.clave === elegida) ?? objetivos.find((o) => o.grupo === pestana) ?? objetivos[0]
  const clave = obj.clave
  const guardado = d.aspectos?.[clave]
  const [borrador, setBorrador] = useState<AspectoGuardado>(guardado ?? {})
  const [error, setError] = useState('')
  const [tema, setTema] = useState<TemaId>(temaGuardado)

  const elegir = (k: string) => { setClave(k); setBorrador(d.aspectos?.[k] ?? {}); setError(''); if (!k.startsWith('rol:')) setSub('apariencia') }
  // Si el elegido se cerró, el fallback de arriba toma su lugar: que el borrador sea el suyo, no el de la sesión cerrada.
  useEffect(() => { if (obj.clave !== elegida) elegir(obj.clave) })
  const irA = (t: string) => {
    setPestana(t as Pestana)
    const primero = objetivos.find((o) => o.grupo === t)
    if (primero && obj.grupo !== t) elegir(primero.clave)
  }
  const base = clave === 'yo' ? YO_FABRICA : obj.rol ? d.aspectos?.[`rol:${obj.rol}`] : undefined
  const vista = useMemo(() => aspecto(clave, borrador, base, obj.rol), [clave, base, borrador, obj.rol])
  const cambiar = (campo: keyof AspectoGuardado, valor: string | undefined) => setBorrador((b) => ({ ...b, [campo]: valor }))
  const guardar = (a: AspectoGuardado | null) => post(`/api/aspectos/${encodeURIComponent(clave)}`, a)
    .then(() => { setError(''); if (!a) setBorrador({}) }, (e: Error) => setError(e.message))
  const n = obj.rol ? nivelDe(d, obj.rol) : null
  const rol = d.roles.find((r) => r.id === obj.rol)

  const esRol = clave.startsWith('rol:') && !!obj.rol
  const visible = pestana !== 'tema' && obj.grupo === pestana // si la pestaña no tiene a quién equipar, no hay editor
  const orquestan = objetivos.filter((o) => o.grupo === 'orquestan')
  const lista = pestana === 'agentes' || pestana === 'orquestan' ? objetivos.filter((o) => o.grupo === pestana) : null

  const apariencia = <>
    <fieldset className="pregunta">
      <legend>Clase</legend>
      <div className="arm-clases">
        {(Object.entries(CLASES) as [Clase, (typeof CLASES)[Clase]][]).map(([id, c]) => (
          <label key={id} className="opcion-pregunta">
            <input type="radio" name="clase" checked={(borrador.clase ?? 'ninguna') === id}
              onChange={() => setBorrador((b) => ({ ...b, clase: id, camisa: undefined, brillo: undefined, pantalon: undefined }))} />
            <span><b>{c.titulo}</b><span className="meta">{c.juego} · {c.descripcion}</span></span>
          </label>
        ))}
      </div>
    </fieldset>

    <div className="arm-colores">
      {COLORES.map(([campo, titulo]) => (
        <label key={campo} className="campo">
          <span>{titulo}</span>
          <input type="color" value={(borrador[campo] as string | undefined) ?? (vista[campo as keyof typeof vista] as string)}
            onChange={(e) => cambiar(campo, e.target.value)} />
        </label>
      ))}
    </div>
    <label className="campo">
      <span>Apodo (se ve en la escena; el nombre real sigue en la ficha)</span>
      <input type="text" maxLength={24} value={borrador.apodo ?? ''} placeholder="Jefe Maestro, V, Slayer…" onChange={(e) => cambiar('apodo', e.target.value || undefined)} />
    </label>
    {error && <p className="aviso-caja rojo" role="alert">{error}</p>}
    <div className="acciones">
      <BotonAccion className="primario" accion={() => guardar(borrador)}>Equipar</BotonAccion>
      <BotonAccion accion={() => guardar(null)}>Quitar equipo</BotonAccion>
    </div>
  </>

  const editor = <section className="contexto" aria-labelledby="arm-equipo">
    <div className="arm-escaparate">
      <Retrato aspecto={vista} actor={actorDe(clave, obj.rol)} tam={120} etiqueta={`Vista previa: ${CLASES[vista.clase].titulo}${vista.rol ? `, con ${RASGOS[vista.rol].titulo}` : ''}`} />
      <div className="arm-ficha">
        <h3 id="arm-equipo" className="arm-nombre">{borrador.apodo || obj.titulo}</h3>
        <span className="meta">{CLASES[vista.clase].titulo} · {CLASES[vista.clase].juego}{vista.rol ? ` · lleva ${RASGOS[vista.rol].titulo}` : ''}</span>
        {n && <div className="arm-nivel">
          <span className="arm-insignia">NV {n.nivel}</span>
          <div className="medidor" role="meter" aria-label="Experiencia del nivel" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(n.pct * 100)}>
            <i style={{ width: `${Math.round(n.pct * 100)}%` }} />
          </div>
          <span className="meta">{n.xp} XP · faltan {n.falta} · {n.hechos} entregas{n.fallos ? `, ${n.fallos} fallidas` : ''}</span>
          {rol && <Hotbar equipo={rol.equipo ?? []} modelo={rol.modelo} />}
          {n.logros.length > 0 && <div className="fila">{n.logros.map((l) => <span key={l} className="chip azul-suave">{l}</span>)}</div>}
        </div>}
      </div>
    </div>
    {esRol && obj.rol
      ? <Pestanas valor={sub} alCambiar={setSub} etiqueta="Qué editar del rol" variante="va" className="pila"
          items={[{ id: 'apariencia', titulo: 'Apariencia' }, { id: 'modo', titulo: 'Modo de trabajo' }]}>
          <Panel valor="apariencia" className="pila">{apariencia}</Panel>
          {/* forceMount: al cambiar de pestaña no se pierde lo que escribiste sin guardar (Radix no oculta lo montado a la fuerza). */}
          <Panel valor="modo" forceMount hidden={sub !== 'modo'}><ModoTrabajo key={obj.rol} rol={obj.rol} /></Panel>
        </Pestanas>
      : apariencia}
  </section>

  return (
    <Ventana id="v-armeria" alCerrar={cerrarVentana}>
      <header>
        <div className="titulos">
          <Titulo>Armería</Titulo>
          <Descripcion>Equipa a tus agentes: clase, colores y apodo. El rol lo heredan sus sesiones; la sesión manda sobre su rol.</Descripcion>
        </div>
        <Cerrar />
      </header>
      <Pestanas valor={pestana} alCambiar={irA} etiqueta="Secciones de la Armería" className="flex min-h-0 flex-1 flex-col"
        items={[{ id: 'yo', titulo: 'Tú' }, { id: 'agentes', titulo: 'Agentes', cuenta: d.roles.length }, { id: 'orquestan', titulo: 'Sesiones', cuenta: orquestan.length }, { id: 'tema', titulo: 'Tema' }]}>
        <Panel valor={pestana} className="cuerpo">
          {pestana === 'tema'
            ? <div className="bloque">
                <h4>Tema de la oficina</h4>
                <label className="campo">
                  <span>Se guarda en este navegador</span>
                  <select value={tema} onChange={(e) => { const t = e.target.value as TemaId; setTema(t); aplicarTema(t) }}>
                    {(Object.entries(TEMAS) as [TemaId, (typeof TEMAS)[TemaId]][]).map(([id, t]) => <option key={id} value={id}>{t.titulo}</option>)}
                  </select>
                </label>
              </div>
            : <div className={lista ? 'dos-col' : undefined}>
                {lista && <aside className="lateral contexto" aria-label={pestana === 'agentes' ? 'Agentes de apoyo' : 'Sesiones que orquestan'}>
                  <p className="meta">{SUBTITULO[pestana as Grupo]}</p>
                  <div className="opciones-lista">
                    {lista.map((o) => (
                      <button key={o.clave} type="button" className="opcion" aria-pressed={o.clave === clave} onClick={() => elegir(o.clave)}>
                        <span className="nombre">{d.aspectos?.[o.clave]?.apodo ?? o.titulo}</span>
                        <span className="meta">{o.sub}{o.rol ? ` · NV ${nivelDe(d, o.rol).nivel}` : ''}</span>
                      </button>
                    ))}
                    {lista.length === 0 && <p className="meta">Ninguna abierta ahora.</p>}
                  </div>
                </aside>}
                {visible && editor}
              </div>}
        </Panel>
      </Pestanas>
    </Ventana>
  )
}

// Barra de equipo (como la de Minecraft): las skills que el rol carga, en 9 casillas, y el modelo con que corre.
const MODELO_CORTO: Record<string, string> = { 'claude-opus-5-5': 'Opus', 'claude-sonnet-5-5': 'Sonnet', 'claude-haiku-5-5': 'Haiku', 'claude-fable-5-1': 'Fable' }
function Hotbar({ equipo, modelo }: { equipo: string[]; modelo?: string }) {
  const casillas = [...equipo.slice(0, 9), ...Array(Math.max(0, 9 - equipo.length)).fill(null)] as (string | null)[]
  return <div className="arm-hotbar-caja">
    <span className="meta">Equipo{modelo ? ` · corre con ${MODELO_CORTO[modelo] ?? modelo}` : ''}</span>
    <ol className="arm-hotbar" aria-label="Skills equipadas">
      {casillas.map((c, i) => c
        ? <li key={i} className="casilla llena" title={c}><span aria-hidden="true">{c.replace(/^.*:/, '').replace(/^millet-/, '').slice(0, 3).toUpperCase()}</span><span className="oculto">{c}</span></li>
        : <li key={i} className="casilla" aria-hidden="true" />)}
    </ol>
    {equipo.length > 0 && <span className="meta arm-hotbar-lista">{equipo.join(' · ')}</span>}
  </div>
}

// Modo de trabajo de un rol: se guarda en agentes/<rol>.md y en ~/.claude/agents/. Lo toma la próxima sesión que abra
// el rol; una sesión viva sigue con lo que tenía al arrancar.
interface ConfigRol { id: RolId; modelo: string; permiso: string; equipo: string[]; permitidos: string[]; instrucciones: string }
interface Skill { id: string; descripcion: string }
const MODELOS_ROL: [string, string][] = [['opus', 'Opus: razona más a fondo, gasta más'], ['sonnet', 'Sonnet: equilibrio entre calidad y costo'],
  ['haiku', 'Haiku: rápido y barato, para trabajo mecánico'], ['fable', 'Fable']]
const PERMISOS_ROL: [string, string][] = [['manual', 'Manual: cada acción te pide permiso en «Te necesitan»'],
  ['acceptEdits', 'Aceptar ediciones: edita sin preguntar; los comandos sí preguntan'], ['auto', 'Auto: trabaja solo y frena lo riesgoso']]
const MAX_EQUIPO = 9
// Lo que escribiste sin guardar, por rol: sobrevive a cambiar de rol o de pestaña (se pierde al recargar la página).
const borradores = new Map<RolId, { c: ConfigRol; reglas: string | null }>()

function ModoTrabajo({ rol }: { rol: RolId }) {
  const [c, setC] = useState<ConfigRol | null>(() => borradores.get(rol)?.c ?? null)
  const [skills, setSkills] = useState<Skill[]>([])
  const [filtro, setFiltro] = useState('')
  const [reglas, setReglas] = useState<string | null>(() => borradores.get(rol)?.reglas ?? null) // texto crudo de «permitidos» mientras lo editas
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  useEffect(() => { if (!borradores.has(rol)) leer<ConfigRol>(`/api/roles/${encodeURIComponent(rol)}/config`).then(setC, () => setAviso({ ok: false, texto: 'No pude leer la configuración del rol' })) }, [rol])
  useEffect(() => { leer<Skill[]>('/api/skills').then(setSkills, () => setSkills([])) }, [])
  // Las equipadas que no están en las carpetas (p. ej. code-review, que trae Claude Code) también se ven, arriba.
  const lista = useMemo(() => {
    if (!c) return []
    const conocidas = new Map(skills.map((x) => [x.id, x]))
    const equipadas = c.equipo.map((id) => conocidas.get(id) ?? { id, descripcion: 'Incluida en Claude Code o fuera de tus carpetas de skills' })
    const q = filtro.trim().toLowerCase()
    return [...equipadas, ...skills.filter((x) => !c.equipo.includes(x.id))].filter((x) => !q || `${x.id} ${x.descripcion}`.toLowerCase().includes(q))
  }, [c, skills, filtro])
  if (!c) return aviso ? <p className="aviso-caja rojo" role="alert">{aviso.texto}</p> : <p className="meta">Cargando modo de trabajo…</p>

  const cambiar = (k: keyof ConfigRol, v: string | string[]) => { const n = { ...c, [k]: v }; setC(n); borradores.set(rol, { c: n, reglas }); setAviso(null) }
  const sinGuardar = borradores.has(rol)
  const alternar = (id: string) => cambiar('equipo', c.equipo.includes(id) ? c.equipo.filter((x) => x !== id) : [...c.equipo, id])
  const libre = filtro.trim()
  const puedeAgregar = libre && /^[a-z0-9][a-z0-9:._-]{0,79}$/i.test(libre) && !c.equipo.includes(libre) && !skills.some((x) => x.id === libre)
  const guardar = () => post<ConfigRol>(`/api/roles/${encodeURIComponent(rol)}/config`,
    { ...c, permitidos: reglas === null ? c.permitidos ?? [] : reglas.split('\n').map((x) => x.trim()).filter(Boolean) })
    .then((r) => { if (r) setC(r); setReglas(null); borradores.delete(rol); setAviso({ ok: true, texto: 'Guardado. Lo toma la próxima sesión que abra este rol.' }) }, (e: Error) => setAviso({ ok: false, texto: e.message }))

  return (
    <fieldset className="pregunta">
      <legend>Modo de trabajo</legend>
      <p className="meta">Aplica a la próxima sesión que abra este rol y a su subagente; una sesión viva sigue con lo que tenía.</p>
      {sinGuardar && <p className="aviso-caja chico" role="status">Tienes cambios sin guardar en este rol.</p>}
      <div className="arm-clases">
        <label className="campo"><span>Modelo</span>
          <select value={c.modelo} onChange={(e) => cambiar('modelo', e.target.value)}>
            {MODELOS_ROL.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
          </select></label>
        <label className="campo"><span>Permisos de su sesión</span>
          <select value={c.permiso} onChange={(e) => cambiar('permiso', e.target.value)}>
            {PERMISOS_ROL.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
          </select></label>
      </div>
      <label className="campo"><span>Skills ({c.equipo.length} de {MAX_EQUIPO}): busca o escribe el nombre de una que no aparezca</span>
        <input type="search" value={filtro} placeholder="qa, playwright, security…" onChange={(e) => setFiltro(e.target.value)} /></label>
      {puedeAgregar && <button type="button" className="opcion" disabled={c.equipo.length >= MAX_EQUIPO} onClick={() => { alternar(libre); setFiltro('') }}>Equipar «{libre}»</button>}
      <div className="opciones-lista arm-skills" role="group" aria-label="Skills disponibles">
        {lista.map((x) => {
          const puesta = c.equipo.includes(x.id)
          return <label key={x.id} className="opcion-pregunta">
            <input type="checkbox" checked={puesta} disabled={!puesta && c.equipo.length >= MAX_EQUIPO} onChange={() => alternar(x.id)} />
            <span><b>{x.id}</b>{x.descripcion && <span className="meta">{x.descripcion}</span>}</span>
          </label>
        })}
        {lista.length === 0 && <p className="meta">Ninguna skill coincide.</p>}
      </div>
      <label className="campo"><span>Comandos que corre sin pedirte permiso, uno por línea (p. ej. Bash(npm run *) o Bash(playwright-cli -s=claude *)). Nunca Bash a secas.</span>
        <textarea rows={6} value={reglas ?? (c.permitidos ?? []).join('\n')} spellCheck={false} onChange={(e) => { setReglas(e.target.value); borradores.set(rol, { c, reglas: e.target.value }); setAviso(null) }} /></label>
      <label className="campo"><span>Instrucciones (su prompt de sistema). Conserva «Cómo trabajas en la oficina»: sin la marca ENTREGA: el encargo no vuelve.</span>
        <textarea rows={14} value={c.instrucciones} maxLength={20000} onChange={(e) => cambiar('instrucciones', e.target.value)} /></label>
      {aviso && <p className={`aviso-caja ${aviso.ok ? 'verde' : 'rojo'}`} role={aviso.ok ? 'status' : 'alert'}>{aviso.texto}</p>}
      <div className="acciones">
        <BotonAccion className="primario" accion={guardar}>Guardar modo de trabajo</BotonAccion>
      </div>
    </fieldset>
  )
}
