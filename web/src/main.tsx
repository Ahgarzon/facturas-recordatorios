import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './styles.css'
import App from './App'

if (import.meta.env.VITE_REVIEW_API_ORIGIN && window.location.protocol === 'http:' && !window.isSecureContext) {
  const secureUrl = new URL(window.location.href)
  secureUrl.protocol = 'https:'
  window.location.replace(secureUrl.href)
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
