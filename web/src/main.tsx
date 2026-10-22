import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { aplicarTema, temaGuardado } from './lib/tema'
import App from './App'

aplicarTema(temaGuardado())
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
