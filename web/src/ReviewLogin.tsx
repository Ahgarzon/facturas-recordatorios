import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, CircleAlert } from 'lucide-react'
import { apiFetch, credentialsRejected, makeAuthorization, readInvoices } from './reviewApi'

import type { ReviewSession } from './reviewApi'

export function ReviewLogin({
  expired,
  onLogin,
}: {
  expired: boolean
  onLogin: (session: ReviewSession) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    if (username.includes(':')) {
      setError('El usuario no puede contener dos puntos.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const authorization = makeAuthorization(username, password)
      const response = await apiFetch('/api/invoices', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      }, authorization)
      if (credentialsRejected(response)) {
        setError('Usuario o contraseña incorrectos. Inténtalo de nuevo.')
        setPassword('')
        return
      }

      const invoices = await readInvoices(response)
      onLogin({ authorization, invoices })
    } catch {
      setError('No se pudo conectar con el panel. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  const notice = error || (expired ? 'La sesión dejó de ser válida. Ingresa nuevamente.' : '')

  return (
    <main className="workspace">
      <section className="review-login ledger" aria-labelledby="review-title">
        <h1 id="review-title">Acceso de revisión</h1>
        <p>Ingresa las credenciales que recibiste para consultar las facturas.</p>
        <form onSubmit={(event) => void signIn(event)}>
          <label htmlFor="review-user">
            Usuario
            <input
              id="review-user"
              name="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={128}
              readOnly={submitting}
              required
            />
          </label>
          <label htmlFor="review-password">
            Contraseña
            <input
              id="review-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              maxLength={512}
              readOnly={submitting}
              required
            />
          </label>
          {notice ? (
            <div className="notice" role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              <span>{notice}</span>
            </div>
          ) : null}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Verificando…' : 'Entrar'}
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>
      </section>
    </main>
  )
}
