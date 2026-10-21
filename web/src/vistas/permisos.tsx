// Permisos, preguntas y diálogos de terminal: lo que el agente espera de ti, con un clic visible por decisión.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icono } from '@/components/icono'
import { Chip, Cuenta } from '@/components/comunes'
import { post, postSeguro, leer, rutaSesion } from '@/lib/api'
import type { Permiso, Pregunta, Sesion } from '@/lib/tipos'

const ETIQUETAS_CAMPO: Record<string, string> = { command: 'Comando', file_path: 'Archivo', url: 'URL', pattern: 'Patrón', path: 'Ruta', description: 'Para qué',
  old_string: 'Texto actual', new_string: 'Texto nuevo', content: 'Contenido', prompt: 'Indicación' }
const DESTINOS_REGLA: Record<string, string> = { localSettings: 'la configuración local del proyecto (.claude/settings.local.json)', projectSettings: 'la configuración del proyecto (.claude/settings.json)', userSettings: 'tu configuración global (~/.claude/settings.json)', session: 'esta sesión' }

// Petición pendiente: qué herramienta, con qué datos, cuánto falta para que pase a su terminal, y aprobar o rechazar.
export function DecisionPermiso({ p, compacto = false }: { p: Permiso; compacto?: boolean }) {
  const [estado, setEstado] = useState('')
  const [motivo, setMotivo] = useState('')
  const decidir = async (decision: 'allow' | 'deny', siempre = false) => {
    try {
      await post(`/api/permisos/${p.id}`, { decision, motivo: decision === 'deny' ? motivo.trim() || undefined : undefined, siempre })
      setEstado(decision === 'allow' ? (siempre ? 'Aprobado y guardado.' : 'Aprobado.') : 'Rechazado.')
    } catch (err) { setEstado((err as Error).message) }
  }
  const campos = compacto ? p.campos.slice(0, 2) : p.campos
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p style={{ margin: 0 }}><b>Pide permiso para {p.herramienta}. </b>Decide aquí en <Cuenta vence={p.vence} /> o pásalo a su terminal; si no decides, aparece allá.</p>
      {campos.map(([k, v]) => <div className="permiso-campo" key={k}><span>{ETIQUETAS_CAMPO[k] ?? k}</span><pre>{v}</pre></div>)}
      {!compacto && <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo del rechazo (opcional; se lo dice al agente)" aria-label="Motivo del rechazo" />}
      {p.reglas?.length > 0 && <div className="permiso-campo"><span>«Permitir siempre» guarda en {DESTINOS_REGLA[p.destino ?? ''] ?? p.destino}</span><pre>{p.reglas.join('\n')}</pre></div>}
      <div className="acciones">
        <button type="button" className="aprobar" onClick={() => decidir('allow')}><Icono n="listo" />Aprobar</button>
        {p.reglas?.length > 0 && <button type="button" className="boton-chico" onClick={() => decidir('allow', true)}>Permitir siempre</button>}
        <button type="button" className="peligro" onClick={() => decidir('deny')}>Rechazar</button>
        <button type="button" className="boton-chico" onClick={() => post(`/api/permisos/${p.id}/terminal`).then(() => setEstado('Ya está en su terminal.'), (e: Error) => setEstado(e.message))}>Decidir en la terminal</button>
        <span className="meta" role="status">{estado}</span>
      </div>
    </div>
  )
}

// Pregunta con opciones (AskUserQuestion): eliges como en la app y la respuesta le llega al agente sin pasar por su terminal.
export function FormularioPregunta({ p }: { p: Pregunta }) {
  const [elegidas, setElegidas] = useState<Record<number, string[]>>({})
  const [otras, setOtras] = useState<Record<number, string>>({})
  const [estado, setEstado] = useState('')
  const valor = (i: number) => {
    const q = p.preguntas[i]
    const lista = [...(elegidas[i] ?? [])]
    const otra = otras[i]?.trim()
    if (otra) lista[q.multiple ? lista.length : 0] = otra
    return lista.join(', ')
  }
  const elegir = (i: number, etiqueta: string, multiple: boolean, marcada: boolean) => setElegidas((e) => ({
    ...e, [i]: multiple ? (marcada ? [...(e[i] ?? []), etiqueta] : (e[i] ?? []).filter((x) => x !== etiqueta)) : [etiqueta],
  }))
  const responder = async () => {
    const respuestas = Object.fromEntries(p.preguntas.map((q, i) => [q.pregunta, valor(i)]))
    if (Object.values(respuestas).some((v) => !v)) { setEstado('Responde todas las preguntas.'); return }
    try { await post(`/api/preguntas/${p.id}`, { respuestas }); setEstado('Enviado.') } catch (err) { setEstado((err as Error).message) }
  }
  return (
    <div className="aviso-caja" style={{ display: 'grid', gap: 10 }}>
      <p style={{ margin: 0 }}><b>Te pregunta. </b>Responde aquí en <Cuenta vence={p.vence} />; si no, la pregunta aparece en su terminal.</p>
      {p.preguntas.map((q, i) => (
        <fieldset className="pregunta" key={i}>
          <legend>{q.titulo && <Chip>{q.titulo}</Chip>} {q.pregunta}</legend>
          {q.multiple && <span className="meta">Puedes elegir varias.</span>}
          {q.opciones.map((o) => (
            <label className="opcion-pregunta" key={o.etiqueta}>
              <input type={q.multiple ? 'checkbox' : 'radio'} name={`pregunta-${p.id}-${i}`} value={o.etiqueta}
                checked={(elegidas[i] ?? []).includes(o.etiqueta)} onChange={(e) => elegir(i, o.etiqueta, q.multiple, e.target.checked)} />
              <span><b>{o.etiqueta}</b>{o.descripcion && <span className="meta">{o.descripcion}</span>}</span>
            </label>
          ))}
          <input type="text" value={otras[i] ?? ''} onChange={(e) => setOtras((o) => ({ ...o, [i]: e.target.value }))}
            placeholder="Otra respuesta (opcional)" aria-label={`Otra respuesta: ${q.pregunta}`} />
        </fieldset>
      ))}
      <div className="acciones"><button type="button" className="primario" onClick={responder}><Icono n="enviar" />Responder</button><span className="meta" role="status">{estado}</span></div>
    </div>
  )
}

// Sesión en tmux con un diálogo en su terminal: ves su pantalla y contestas con las teclas del diálogo, como si estuvieras ahí.
export function PantallaTmux({ s }: { s: Sesion }) {
  const [texto, setTexto] = useState('Cargando su pantalla…')
  const pre = useRef<HTMLPreElement>(null)
  const cargar = useCallback(() => leer<{ texto?: string; error?: string }>(rutaSesion(s.id, 'pantalla'))
    .then((r) => setTexto((r.texto ?? r.error ?? '').replace(/\s+$/, '')), () => setTexto('No pude leer su pantalla.')), [s.id])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (pre.current) pre.current.scrollTop = pre.current.scrollHeight }, [texto])
  const tecla = (t: string, etiqueta = t) => <button type="button" className="boton-chico" key={t} onClick={async () => {
    await postSeguro(rutaSesion(s.id, 'tecla'), { tecla: t })
    setTimeout(cargar, 400)
  }}>{etiqueta}</button>
  return (
    <div>
      <p style={{ margin: '0 0 6px' }}>Su terminal muestra este diálogo. Elige la opción con su número, igual que en la terminal:</p>
      <pre ref={pre} style={{ margin: '0 0 8px', maxHeight: 260, overflow: 'auto', fontSize: 12, whiteSpace: 'pre' }}>{texto}</pre>
      <div className="acciones">{tecla('1')}{tecla('2')}{tecla('3')}{tecla('4')}{tecla('Escape', 'Esc')}<button type="button" className="boton-chico" onClick={cargar}>Actualizar</button></div>
    </div>
  )
}
