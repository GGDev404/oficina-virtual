// Armería: equipo de cada personaje (clase, colores, apodo), nivel de los roles y tema de la oficina.
// El equipo de un rol lo hereda cada sesión de ese rol; el de una sesión manda sobre el de su rol.
import { useMemo, useState } from 'react'
import { BotonAccion } from '@/components/comunes'
import { useOficina } from '@/components/contexto'
import { Retrato } from '@/components/retrato'
import { Cerrar, Descripcion, Titulo, Ventana } from '@/components/ventana'
import { aspecto, CLASES, YO_FABRICA } from '@/escena/sprites'
import { post } from '@/lib/api'
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

const COLORES: [keyof AspectoGuardado, string][] = [['camisa', 'Armadura o camisa'], ['brillo', 'Visor y luces'], ['pelo', 'Pelo'], ['piel', 'Piel'], ['pantalon', 'Pantalón']]

export function Armeria({ inicial }: { inicial?: string }) {
  const { datos: d, tareas, cerrarVentana } = useOficina()
  const objetivos = useMemo(() => [
    { clave: 'yo', titulo: 'Tú', sub: 'Tu avatar en tu oficina', rol: null as RolId | null },
    ...d.roles.map((r) => ({ clave: `rol:${r.id}`, titulo: r.titulo, sub: 'Rol: lo heredan sus sesiones', rol: r.id })),
    ...d.sesiones.filter((s) => VIVOS.has(s.estado)).map((s) => ({ clave: `sesion:${s.id}`, titulo: nombreSesion(s, tareas), sub: 'Solo esta sesión', rol: s.rol })),
  ], [d.roles, d.sesiones, tareas])
  const [clave, setClave] = useState(inicial && objetivos.some((o) => o.clave === inicial) ? inicial : 'yo')
  const obj = objetivos.find((o) => o.clave === clave) ?? objetivos[0]
  const guardado = d.aspectos?.[clave]
  const [borrador, setBorrador] = useState<AspectoGuardado>(guardado ?? {})
  const [error, setError] = useState('')
  const [tema, setTema] = useState<TemaId>(temaGuardado)

  const elegir = (k: string) => { setClave(k); setBorrador(d.aspectos?.[k] ?? {}); setError('') }
  const base = clave === 'yo' ? YO_FABRICA : obj.rol ? d.aspectos?.[`rol:${obj.rol}`] : undefined
  const vista = useMemo(() => aspecto(clave, { ...base, ...borrador }), [clave, base, borrador])
  const cambiar = (campo: keyof AspectoGuardado, valor: string | undefined) => setBorrador((b) => ({ ...b, [campo]: valor }))
  const guardar = (a: AspectoGuardado | null) => post(`/api/aspectos/${encodeURIComponent(clave)}`, a)
    .then(() => { setError(''); if (!a) setBorrador({}) }, (e: Error) => setError(e.message))
  const n = obj.rol ? nivelDe(d, obj.rol) : null

  return (
    <Ventana id="v-armeria" alCerrar={cerrarVentana}>
      <header>
        <div className="titulos">
          <Titulo>Armería</Titulo>
          <Descripcion>Equipa a tus agentes: clase, colores y apodo. El rol lo heredan sus sesiones; la sesión manda sobre su rol.</Descripcion>
        </div>
        <Cerrar />
      </header>
      <div className="cuerpo dos-col">
        <section className="contexto" aria-labelledby="arm-equipo">
          <div className="arm-escaparate">
            <Retrato aspecto={vista} tam={120} etiqueta={`Vista previa: ${CLASES[vista.clase].titulo}`} />
            <div className="arm-ficha">
              <h3 id="arm-equipo" className="arm-nombre">{borrador.apodo || obj.titulo}</h3>
              <span className="meta">{CLASES[vista.clase].titulo} · {CLASES[vista.clase].juego}</span>
              {n && <div className="arm-nivel">
                <span className="arm-insignia">NV {n.nivel}</span>
                <div className="medidor" role="meter" aria-label="Experiencia del nivel" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(n.pct * 100)}>
                  <i style={{ width: `${Math.round(n.pct * 100)}%` }} />
                </div>
                <span className="meta">{n.xp} XP · faltan {n.falta} · {n.hechos} entregas{n.fallos ? `, ${n.fallos} fallidas` : ''}</span>
                {n.logros.length > 0 && <div className="fila">{n.logros.map((l) => <span key={l} className="chip azul-suave">{l}</span>)}</div>}
              </div>}
            </div>
          </div>

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
        </section>

        <aside className="lateral contexto">
          <div className="bloque">
            <h4>Personaje</h4>
            <div className="opciones-lista">
              {objetivos.map((o) => (
                <button key={o.clave} type="button" className="opcion" aria-pressed={o.clave === clave} onClick={() => elegir(o.clave)}>
                  <span className="nombre">{d.aspectos?.[o.clave]?.apodo ?? o.titulo}</span>
                  <span className="meta">{o.sub}{o.rol ? ` · NV ${nivelDe(d, o.rol).nivel}` : ''}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="bloque">
            <h4>Tema de la oficina</h4>
            <label className="campo">
              <span>Se guarda en este navegador</span>
              <select value={tema} onChange={(e) => { const t = e.target.value as TemaId; setTema(t); aplicarTema(t) }}>
                {(Object.entries(TEMAS) as [TemaId, (typeof TEMAS)[TemaId]][]).map(([id, t]) => <option key={id} value={id}>{t.titulo}</option>)}
              </select>
            </label>
          </div>
        </aside>
      </div>
    </Ventana>
  )
}
