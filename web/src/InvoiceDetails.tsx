import { useEffect, useRef } from 'react'
import { ArrowRight, CircleAlert, Clock3, MailCheck, X } from 'lucide-react'
import { formatDate, formatMoney, reminderSchedule, statusLabel } from './invoices'
import type { Invoice, StatusLabels } from './invoices'
import { InvoiceStatus } from './InvoiceTable'

export function InvoiceDetails({
  invoice,
  labels,
  onClose,
}: {
  invoice: Invoice
  labels: StatusLabels
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const history = [...invoice.history].sort((a, b) => b.sentAt.localeCompare(a.sentAt))

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  return (
    <dialog className="invoice-detail" aria-labelledby="invoice-detail-title" ref={dialog} onClose={onClose}>
      <div className="invoice-detail__header">
        <div>
          <p className="muted">{invoice.customer}</p>
          <h2 id="invoice-detail-title">Factura {invoice.number}</h2>
        </div>
        <form method="dialog">
          <button className="icon-button" type="submit" aria-label="Cerrar detalle">
            <X size={20} aria-hidden="true" />
          </button>
        </form>
      </div>

      <dl className="detail-summary">
        <div>
          <dt>Valor</dt>
          <dd className="amount">{formatMoney(invoice.amount, invoice.currency)}</dd>
        </div>
        <div>
          <dt>Estado actual</dt>
          <dd><InvoiceStatus status={invoice.status} labels={labels} /></dd>
        </div>
        <div>
          <dt>Próximo aviso</dt>
          <dd>{reminderSchedule(invoice)}</dd>
        </div>
      </dl>

      {invoice.reviewRequired ? (
        <div className="notice" role="status">
          <CircleAlert size={19} aria-hidden="true" />
          <div>
            <strong>Envío pendiente de revisión</strong>
            <p>Confirma el resultado del último intento antes de volver a enviar el aviso.</p>
            {invoice.reviewMessageId ? (
              <span className="history-id">ID del mensaje <code>{invoice.reviewMessageId}</code></span>
            ) : null}
          </div>
        </div>
      ) : invoice.lastFailureAt ? (
        <div className="notice" role="status">
          <CircleAlert size={19} aria-hidden="true" />
          <div>
            <strong>El envío anterior falló</strong>
            <p>Último intento <time dateTime={invoice.lastFailureAt}>{formatDate(invoice.lastFailureAt)}</time>.</p>
          </div>
        </div>
      ) : null}

      <section className="history" aria-labelledby="history-title">
        <h3 id="history-title">Historial de avisos</h3>
        {history.length === 0 ? (
          <div className="history-empty">
            <Clock3 size={18} aria-hidden="true" />
            <p>Esta factura aún no tiene avisos registrados.</p>
          </div>
        ) : (
          <ol className="history-list">
            {history.map((entry) => (
              <li key={entry.messageId}>
                <span className="history-icon"><MailCheck size={17} aria-hidden="true" /></span>
                <div className="history-entry">
                  <p className="history-transition">
                    {statusLabel(entry.fromStatus, labels)}
                    <ArrowRight size={15} aria-hidden="true" />
                    <span className="visually-hidden">a</span>
                    {statusLabel(entry.toStatus, labels)}
                  </p>
                  <time dateTime={entry.sentAt}>{formatDate(entry.sentAt)}</time>
                  <span className="history-id">
                    ID del mensaje <code>{entry.messageId}</code>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </dialog>
  )
}
