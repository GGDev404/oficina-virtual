// Preguntas: la tabla preguntas.md del vault. Lo que decides tú, lo que hay que enviar (agrupado por persona, con
// texto listo para copiar) y lo que espera respuesta. Responder escribe en el archivo con fecha.
import { useCallback, useEffect, useState } from 'react'
import { BotonAccion, Chip } from '@/components/comunes'
import { leer, post } from '@/lib/api'

export interface Pregunta {
  id: string; estado: string; para: string; bloquea: string; tarea: string; pregunta: string
  contexto: string; enviada: string; respuesta: string; respondida: string; fuente: string
}
type Filtro = 'tuyas' | 'enviar' | 'esperando' | 'supuestos' | 'cerradas'
const FILTROS: [Filtro, string, (p: Pregunta) => boolean][] = [
  ['tuyas', 'Las decides tú', (p) => p.estado === 'por responder'],
  ['enviar', 'Por enviar', (p) => p.estado === 'por enviar'],
  ['esperando', 'Esperando respuesta', (p) => p.estado === 'enviada'],
  ['supuestos', 'Con supuesto', (p) => p.estado === 'supuesto'],
  ['cerradas', 'Cerradas', (p) => p.estado === 'respondida' || p.estado === 'descartada'],
]
const URL = '/api/registro-preguntas'

// Cuántas bloquean y siguen abiertas: el número de la pestaña.
const CERRADAS = ['respondida', 'descartada', 'supuesto']
export const abiertasQueBloquean = (l: Pregunta[]) => l.filter((p) => p.bloquea === 'sí' && !CERRADAS.includes(p.estado)).length

export function useRegistroPreguntas() {
  const [datos, setDatos] = useState<{ filas: Pregunta[]; error?: string } | null>(null)
  const cargar = useCallback(() => leer<{ filas: Pregunta[]; error?: string }>(URL).then(setDatos).catch(() => setDatos({ filas: [], error: 'la oficina no responde' })), [])
  useEffect(() => { cargar() }, [cargar])
  return { datos, cargar }
}

export function PreguntasVista({ datos, cargar }: ReturnType<typeof useRegistroPreguntas>) {
  const [filtro, setFiltro] = useState<Filtro>('tuyas')
  if (!datos) return <p className="vacio">Cargando…</p>
  if (datos.error) return <p className="vacio">{datos.error}</p>
  const lista = datos.filas.filter(FILTROS.find(([f]) => f === filtro)![2])
    .sort((a, b) => Number(b.bloquea === 'sí') - Number(a.bloquea === 'sí'))
  const cambiar = (id: string, cuerpo: object) => post(`${URL}/${id}`, cuerpo).then(cargar)

  return <>
    <div className="fila">{FILTROS.map(([f, texto, pasa]) =>
      <button key={f} type="button" className={`boton-chico ${filtro === f ? 'primario' : ''}`} onClick={() => setFiltro(f)}>
        {texto} <span className="cuenta">{datos.filas.filter(pasa).length}</span></button>)}
    </div>
    {!lista.length && <p className="vacio">Nada aquí.</p>}
    {filtro === 'enviar'
      ? Object.entries(Object.groupBy(lista, (p) => p.para)).map(([para, grupo]) => <PorPersona key={para} para={para} grupo={grupo!} cambiar={cambiar} />)
      : lista.map((p) => <Fila key={p.id} p={p} cambiar={cambiar} />)}
  </>
}

// Por persona: copiar el mensaje con sus preguntas y marcarlas enviadas cuando ya las mandaste.
function PorPersona({ para, grupo, cambiar }: { para: string; grupo: Pregunta[]; cambiar: (id: string, c: object) => Promise<unknown> }) {
  const texto = `Hola ${para}, tengo estas preguntas para avanzar:\n\n` +
    grupo.map((p, i) => `${i + 1}. ${p.pregunta}${p.tarea && p.tarea !== '—' ? ` (${p.tarea})` : ''}`).join('\n')
  return <div className="comentario">
    <div className="fila"><b>{para}</b><span className="meta">{grupo.length} por enviar</span></div>
    {grupo.map((p) => <Fila key={p.id} p={p} cambiar={cambiar} />)}
    <div className="fila">
      <BotonAccion className="boton-chico primario" accion={() => navigator.clipboard.writeText(texto)}>Copiar mensaje</BotonAccion>
      <BotonAccion accion={async () => { for (const p of grupo) await cambiar(p.id, { estado: 'enviada' }) }}>Ya las envié</BotonAccion>
    </div>
  </div>
}

function Fila({ p, cambiar }: { p: Pregunta; cambiar: (id: string, c: object) => Promise<unknown> }) {
  const [respuesta, setRespuesta] = useState('')
  const [error, setError] = useState('')
  const abierta = p.estado !== 'respondida' && p.estado !== 'descartada' // un supuesto se puede confirmar
  return <div className="comentario">
    <div className="fila"><b>{p.id}</b>{p.bloquea === 'sí' && <Chip color="rojo">bloquea</Chip>}
      <Chip>{p.para}</Chip>{p.tarea && p.tarea !== '—' && <span className="meta">{p.tarea}</span>}
      {p.enviada && <span className="meta">enviada {p.enviada}</span>}
      {(p.estado === 'supuesto' || p.estado === 'descartada') && <Chip color="naranja">{p.estado}</Chip>}</div>
    <div className="mensaje">{p.pregunta}</div>
    {p.contexto && p.contexto !== '—' && <div className="meta">{p.contexto}</div>}
    {p.respuesta && <div className="mensaje"><b>{p.estado === 'supuesto' ? 'Supuesto' : 'Respuesta'}{p.respondida ? ` (${p.respondida})` : ''}: </b>{p.respuesta}</div>}
    {abierta && <form className="fila" onSubmit={async (e) => {
      e.preventDefault()
      try { await cambiar(p.id, { respuesta }); setRespuesta(''); setError('') } catch (x) { setError((x as Error).message) }
    }}>
      <textarea className="crece" rows={2} maxLength={2000} required aria-label={`Respuesta a ${p.id}`}
        placeholder={p.estado === 'por responder' ? 'Tu decisión' : `Lo que contestó ${p.para}`} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
      <button type="submit" className="boton-chico primario">Guardar</button>
    </form>}
    {error && <div className="meta" role="alert">{error}</div>}
  </div>
}
