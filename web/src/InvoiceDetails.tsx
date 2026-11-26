import { ArrowRight, CircleAlert, Clock3, MailCheck, MailOpen } from 'lucide-react'
import { DetailDrawer } from './DetailDrawer'
import { formatDate, formatMoney, reminderSchedule, statusLabel } from './invoices'
import type { Invoice, StatusLabels } from './invoices'
import { InvoiceStatus } from './InvoiceTable'

export function InvoiceDetails({
  invoice,
  labels,
  onClose,
  onOpenMail,
}: {
  invoice: Invoice
  labels: StatusLabels
  onClose: () => void
  onOpenMail: (messageId: string) => void
}) {
  const history = [...invoice.history].sort((a, b) => b.sentAt.localeCompare(a.sentAt))

  return (
    <DetailDrawer
      title={`Factura ${invoice.number}`}
      subtitle={invoice.customer}
      closeLabel="Cerrar detalle"
      onClose={onClose}
    >

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
                  <button className="history-mail-link" type="button" onClick={() => onOpenMail(entry.messageId)}>
                    <MailOpen size={16} aria-hidden="true" />
                    Ver correo en bandeja
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </DetailDrawer>
  )
}
