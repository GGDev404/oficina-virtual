// Markdown sencillo de los agentes → elementos de React (nunca HTML del texto): párrafos, títulos, listas, tablas,
// código y énfasis. React escapa todo el texto; los enlaces solo aceptan http(s).
import { memo, type ReactNode } from 'react'

function enLinea(texto: string): ReactNode[] {
  const nodos: ReactNode[] = []
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|((?<![\w*])\*[^*\s][^*\n]*\*(?![\w*])|(?<!\w)_[^_\s][^_\n]*_(?!\w))|(\[[^\]\n]+\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s)<>]+)/g
  let i = 0, m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    if (m.index > i) nodos.push(texto.slice(i, m.index))
    const t = m[0], k = m.index
    if (m[1]) nodos.push(<code key={k}>{t.slice(1, -1)}</code>)
    else if (m[2]) nodos.push(<strong key={k}>{enLinea(t.slice(2, -2))}</strong>)
    else if (m[3]) nodos.push(<em key={k}>{t.slice(1, -1)}</em>)
    else if (m[4]) nodos.push(<a key={k} href={m[5]} target="_blank" rel="noopener">{t.slice(1, t.indexOf(']'))}</a>)
    else nodos.push(<a key={k} href={t} target="_blank" rel="noopener">{t}</a>)
    i = k + t.length
  }
  if (i < texto.length) nodos.push(texto.slice(i))
  return nodos
}

const VINETA = /^\s*([-*•]|\d+[.)])\s+/
const celdas = (x: string) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

function bloques(texto: string): ReactNode[] {
  const lineas = String(texto).replace(/\r/g, '').split('\n')
  const salida: ReactNode[] = []
  let i = 0
  while (i < lineas.length) {
    const l = lineas[i], k = i
    if (/^\s*```/.test(l)) {
      const buf = []
      for (i++; i < lineas.length && !/^\s*```/.test(lineas[i]); i++) buf.push(lineas[i])
      i++
      salida.push(<pre key={k}><code>{buf.join('\n')}</code></pre>)
    } else if (!l.trim()) {
      i++
    } else if (/^#{1,4}\s+/.test(l)) {
      salida.push(<p key={k} className="md-titulo">{enLinea(l.replace(/^#{1,4}\s+/, ''))}</p>)
      i++
    } else if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1] ?? '')) {
      const cabeza = celdas(l)
      const filas: string[][] = []
      for (i += 2; i < lineas.length && /^\s*\|.*\|\s*$/.test(lineas[i]); i++) filas.push(celdas(lineas[i]))
      salida.push(<div key={k} className="md-tabla"><table>
        <thead><tr>{cabeza.map((c, j) => <th key={j}>{enLinea(c)}</th>)}</tr></thead>
        <tbody>{filas.map((f, n) => <tr key={n}>{f.map((c, j) => <td key={j}>{enLinea(c)}</td>)}</tr>)}</tbody>
      </table></div>)
    } else if (VINETA.test(l)) {
      const ordenada = /^\s*\d/.test(l)
      const items: string[] = []
      while (i < lineas.length && VINETA.test(lineas[i])) {
        items.push(lineas[i].replace(VINETA, ''))
        for (i++; i < lineas.length && /^\s{2,}\S/.test(lineas[i]) && !VINETA.test(lineas[i]); i++) items[items.length - 1] += ` ${lineas[i].trim()}`
      }
      const lis = items.map((x, j) => <li key={j}>{enLinea(x)}</li>)
      salida.push(ordenada ? <ol key={k}>{lis}</ol> : <ul key={k}>{lis}</ul>)
    } else {
      const buf = [l]
      for (i++; i < lineas.length && lineas[i].trim() && !/^(\s*```|#{1,4}\s|\s*\|)/.test(lineas[i]) && !VINETA.test(lineas[i]); i++) buf.push(lineas[i])
      salida.push(<p key={k}>{enLinea(buf.join('\n'))}</p>)
    }
  }
  return salida
}

// memo: la conversación se repinta con cada evento, pero cada mensaje solo se vuelve a armar si cambia su texto.
export const Markdown = memo(function Markdown({ texto }: { texto: string }) {
  return <div className="md">{bloques(texto)}</div>
})
