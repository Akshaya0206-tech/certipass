import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initStore } from './services/store'
import './index.css'

// The demo accounts are hashed on first load, so the store is ready before the first render.
initStore().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
