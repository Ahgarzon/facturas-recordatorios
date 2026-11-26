import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, CircleAlert, RefreshCw } from 'lucide-react'
import { DetailDrawer } from './DetailDrawer'
import { formatDate } from './invoices'
import { apiFetch, credentialsRejected } from './reviewApi'

type MailSummary = {
  id: string
  messageId: string
  invoiceNumber: string | null
  subject: string
  from: string
  to: string[]
  receivedAt: string
  read: boolean
}

type Mail = MailSummary & { text: string }

type MailAccess = {
  authorization?: string
  onAuthenticationFailed?: () => void
}

type MailFailure = 'unavailable' | 'failed'
type MailSelection = { id: string; messageId?: never } | { messageId: string; id?: never }

function ReadingStatus({ read }: { read: boolean }) {
  return <span className={`mail-status${read ? '' : ' mail-status--new'}`}>{read ? 'Leído' : 'Sin leer'}</span>
}

function MailDetails({
  preview,
  authorization,
  onAuthenticationFailed,
  onRead,
  onClose,
}: MailAccess & {
  preview: MailSummary
  onRead: (mail: Mail) => void
  onClose: () => void
}) {
  const [mail, setMail] = useState<Mail | null>(null)
  const [error, setError] = useState<MailFailure | null>(null)
  const [requestNumber, setRequestNumber] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function openMessage() {
      try {
        const response = await apiFetch(`/api/demo-correos/${encodeURIComponent(preview.id)}`, {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
        }, authorization)
        if (controller.signal.aborted) return
        if (credentialsRejected(response) && onAuthenticationFailed) {
          onAuthenticationFailed()
          return
        }
        if (response.status === 404) {
          setError('unavailable')
          return
        }
        if (!response.ok) throw new Error('No se pudo consultar este correo')

        const result: Mail = await response.json()
        if (controller.signal.aborted) return
        setMail(result)
        onRead(result)
      } catch {
        if (!controller.signal.aborted) setError('failed')
      }
    }

    void openMessage()
    return () => controller.abort()
  }, [authorization, onAuthenticationFailed, onRead, preview.id, requestNumber])

  const message = mail ?? preview

  return (
    <DetailDrawer
      title={message.subject || 'Correo sin asunto'}
      subtitle={message.invoiceNumber ? `Factura ${message.invoiceNumber}` : 'Bandeja de prueba'}
      closeLabel="Cerrar correo"
      onClose={onClose}
    >
      <dl className="detail-summary mail-summary">
        <div><dt>De</dt><dd>{message.from || '—'}</dd></div>
        <div><dt>Para</dt><dd>{message.to.join(', ') || '—'}</dd></div>
        <div><dt>Recibido</dt><dd><time dateTime={message.receivedAt}>{formatDate(message.receivedAt)}</time></dd></div>
        <div><dt>Lectura</dt><dd><ReadingStatus read={message.read} /></dd></div>
      </dl>

      {mail ? (
        <section className="mail-body" aria-labelledby="mail-body-title">
          <h3 id="mail-body-title">Contenido del correo</h3>
          <pre>{mail.text || 'El mensaje no tiene contenido en texto plano.'}</pre>
        </section>
      ) : error ? (
        <div className="mail-error">
          <p className="notice" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            {error === 'unavailable' ? 'El correo ya no está disponible en la bandeja de prueba.' : 'No se pudo abrir el correo.'}
          </p>
          {error === 'failed' ? (
            <button
              className="refresh-button"
              type="button"
              onClick={() => {
                setError(null)
                setRequestNumber((previous) => previous + 1)
              }}
            >
              Reintentar
            </button>
          ) : null}
        </div>
      ) : <p className="mail-loading" role="status">Cargando correo…</p>}
    </DetailDrawer>
  )
}

export function DemoInbox({
  authorization,
  onAuthenticationFailed,
  messageId,
}: MailAccess & { messageId?: string }) {
  const [messages, setMessages] = useState<MailSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<MailFailure | null>(null)
  const [requestNumber, setRequestNumber] = useState(0)
  const [selected, setSelected] = useState<MailSelection | null>(messageId ? { messageId } : null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadMessages() {
      try {
        const response = await apiFetch('/api/demo-correos', {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
        }, authorization)
        if (controller.signal.aborted) return
        if (credentialsRejected(response) && onAuthenticationFailed) {
          onAuthenticationFailed()
          return
        }
        if (response.status === 404) {
          setError('unavailable')
          return
        }
        if (!response.ok) throw new Error('No se pudo consultar la bandeja')

        const entries: MailSummary[] = await response.json()
        if (!Array.isArray(entries)) throw new Error('Formato de bandeja inesperado')
        if (controller.signal.aborted) return
        setMessages(entries)
        setError(null)
      } catch {
        if (!controller.signal.aborted) setError('failed')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadMessages()
    return () => controller.abort()
  }, [authorization, onAuthenticationFailed, requestNumber])

  const updateReadState = useCallback((mail: Mail) => {
    setMessages((previous) => previous?.map((message) =>
      message.id === mail.id ? { ...message, read: mail.read } : message,
    ) ?? null)
  }, [])

  const selectedMail = selected && messages?.find((mail) =>
    selected.id === mail.id || selected.messageId === mail.messageId,
  )
  const linkedMailMissing = Boolean(selected?.messageId && messages && !selectedMail && !loading && !error)
  const unread = messages?.filter((message) => !message.read).length

  function refresh() {
    setLoading(true)
    setRequestNumber((previous) => previous + 1)
  }

  return (
    <section className="ledger demo-inbox" aria-labelledby="demo-inbox-title">
      <div className="ledger__heading">
        <div>
          <h1 id="demo-inbox-title">Correos de prueba</h1>
          <p>Mensajes ficticios capturados por Mailpit. Abrir un correo lo marca como leído en la bandeja de prueba.</p>
        </div>
        <button className="refresh-button" onClick={refresh} type="button" disabled={loading}>
          <RefreshCw className={loading ? 'is-spinning' : undefined} size={16} aria-hidden="true" />
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {error ? (
        <p className="notice notice--ledger" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          {error === 'unavailable'
            ? 'La bandeja de prueba no está disponible en esta instalación.'
            : 'No se pudo consultar la bandeja. Usa Actualizar para reintentar.'}
        </p>
      ) : null}

      {linkedMailMissing ? (
        <p className="notice notice--ledger" role="status">
          <CircleAlert size={18} aria-hidden="true" />
          Este aviso todavía no aparece en la bandeja de prueba.
        </p>
      ) : null}

      {messages?.length ? (
        <ul className="mail-list" aria-label="Mensajes recibidos">
          {messages.map((message) => (
            <li className={message.read ? 'mail-row' : 'mail-row mail-row--new'} key={message.id}>
              <button
                type="button"
                className="mail-open"
                aria-haspopup="dialog"
                onClick={() => setSelected({ id: message.id })}
              >
                <span>{message.subject || 'Correo sin asunto'}</span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
              <p className="mail-recipient">{message.to.join(', ') || 'Sin destinatario'}</p>
              <ReadingStatus read={message.read} />
              <time className="mail-received" dateTime={message.receivedAt}>{formatDate(message.receivedAt)}</time>
            </li>
          ))}
        </ul>
      ) : loading ? (
        <div className="empty-table" role="status">Cargando bandeja…</div>
      ) : error ? null : (
        <div className="empty-table"><h2>Todavía no hay correos en la bandeja.</h2></div>
      )}

      <div className="ledger__footer">
        <span aria-live="polite">{messages ? `${messages.length} ${messages.length === 1 ? 'correo recibido' : 'correos recibidos'} · ${unread} sin leer` : '—'}</span>
        <span>Hora de Colombia</span>
      </div>

      {selectedMail ? (
        <MailDetails
          key={selectedMail.id}
          preview={selectedMail}
          authorization={authorization}
          onAuthenticationFailed={onAuthenticationFailed}
          onRead={updateReadState}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  )
}
