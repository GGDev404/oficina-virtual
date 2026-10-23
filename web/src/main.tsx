import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { aplicarTema, temaGuardado } from './lib/tema'
import App from './App'

aplicarTema(temaGuardado())
// Solo desarrollo: /?galeria muestra todos los personajes en todas sus poses (escena/galeria.tsx).
const galeria = import.meta.env.DEV && new URLSearchParams(location.search).has('galeria')
const raiz = createRoot(document.getElementById('root')!)
if (galeria) void import('./escena/galeria').then(({ Galeria }) => raiz.render(<StrictMode><Galeria /></StrictMode>))
else raiz.render(<StrictMode><App /></StrictMode>)
