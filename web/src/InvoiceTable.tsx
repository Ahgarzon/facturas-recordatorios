import { ArrowUpRight } from 'lucide-react'
import { formatMoney, reminderSchedule, statusLabel, statusTone } from './invoices'
import type { Invoice, StatusLabels } from './invoices'

export function InvoiceStatus({ status, labels }: { status: string; labels: StatusLabels }) {
  return (
    <span className={`status status--${statusTone(status)}`}>
      <span className="status__dot" aria-hidden="true" />
      {statusLabel(status, labels)}
    </span>
  )
}

export function InvoiceTable({
  invoices,
  labels,
  onSelect,
}: {
  invoices: Invoice[]
  labels: StatusLabels
  onSelect: (id: string) => void
}) {
  return (
    <table className="invoice-table" role="table">
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader">Factura</th>
          <th scope="col" role="columnheader">Cliente</th>
          <th scope="col" role="columnheader" className="invoice-table__number">Valor</th>
          <th scope="col" role="columnheader">Estado</th>
          <th scope="col" role="columnheader" className="invoice-table__schedule">Próximo aviso</th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {invoices.map((invoice) => (
          <tr key={invoice.id} role="row">
            <th scope="row" role="rowheader" className="invoice-table__invoice">
              <button
                className="invoice-link"
                type="button"
                aria-haspopup="dialog"
                aria-label={`Ver historial de la factura ${invoice.number}`}
                onClick={() => onSelect(invoice.id)}
              >
                {invoice.number}
                <ArrowUpRight className="invoice-link__arrow" size={15} aria-hidden="true" />
              </button>
            </th>
            <td role="cell" className="invoice-table__customer">{invoice.customer}</td>
            <td role="cell" className="invoice-table__number amount">{formatMoney(invoice.amount, invoice.currency)}</td>
            <td role="cell" className="invoice-table__status">
              <InvoiceStatus status={invoice.status} labels={labels} />
              {invoice.reviewRequired ? <span className="review-tag">Requiere revisión</span> : null}
            </td>
            <td role="cell" className="invoice-table__schedule">{reminderSchedule(invoice)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
