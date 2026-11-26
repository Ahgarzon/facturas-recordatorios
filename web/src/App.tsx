import { useState } from 'react'
import { ArrowDown, CircleAlert, ReceiptText, RefreshCw } from 'lucide-react'
import { InvoiceDetails } from './InvoiceDetails'
import { InvoiceTable } from './InvoiceTable'
import { statusLabel, timeFormat } from './invoices'
import type { Invoice } from './invoices'
import { useInvoices } from './useInvoices'

type View = 'all' | 'scheduled' | 'closed' | 'review'

const views = [
  { id: 'all', label: 'Todas', includes: () => true },
  { id: 'scheduled', label: 'Con aviso', includes: (invoice: Invoice) => Boolean(invoice.nextReminderAt && !invoice.reviewRequired) },
  { id: 'closed', label: 'Desactivadas', includes: (invoice: Invoice) => invoice.status === 'desactivado' },
  { id: 'review', label: 'En revisión', includes: (invoice: Invoice) => invoice.reviewRequired },
] satisfies { id: View; label: string; includes: (invoice: Invoice) => boolean }[]

function TablePlaceholder() {
  return (
    <div className="loading-table" role="status">
      <span className="visually-hidden">Cargando facturas…</span>
      <div aria-hidden="true" />
      <div aria-hidden="true" />
      <div aria-hidden="true" />
    </div>
  )
}

export default function App() {
  const { invoices, labels, updatedAt, refreshing, requestFailed, refresh } = useInvoices()
  const [view, setView] = useState<View>('all')
  const [customer, setCustomer] = useState('')
  const [status, setStatus] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const customers = [...new Set(invoices?.map((invoice) => invoice.customer))].sort()
  const entries = invoices?.filter((invoice) => !customer || invoice.customer === customer)
  const groups = views.map((option) => ({ ...option, invoices: entries?.filter(option.includes) }))
  const matchingView = groups.find((option) => option.id === view)
  const available = matchingView?.invoices
  const statuses = [...new Set([...(available?.map((invoice) => invoice.status) ?? []), status].filter(Boolean))].sort()
  const filtered = available?.filter((invoice) => !status || invoice.status === status)
  const selected = invoices?.find((invoice) => invoice.id === selectedId)
  const filtersActive = Boolean(view !== 'all' || customer || status)

  function clearFilters() {
    setView('all')
    setCustomer('')
    setStatus('')
  }

  return (
    <>
      <header className="top-bar">
        <div className="top-bar__inner">
          <div className="brand">
            <span className="brand-icon"><ReceiptText size={19} aria-hidden="true" /></span>
            <span>Control de facturas</span>
          </div>
          <span className="demo-label"><span aria-hidden="true" /> Datos ficticios</span>
        </div>
      </header>

      <main className="workspace">
        <section className="ledger" aria-labelledby="ledger-title">
          <div className="ledger__heading">
            <div>
              <h1 id="ledger-title">Facturas</h1>
              {invoices ? (
                <p>{invoices.length} {invoices.length === 1 ? 'factura' : 'facturas'} · {customers.length} {customers.length === 1 ? 'cliente' : 'clientes'}</p>
              ) : null}
            </div>
            <button className="refresh-button" type="button" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw className={refreshing ? 'is-spinning' : undefined} size={16} aria-hidden="true" />
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          <div className="ledger__controls">
            <div className="views" role="group" aria-label="Vistas de facturas">
              {groups.map((option) => (
                <button
                  className="view"
                  key={option.id}
                  type="button"
                  aria-pressed={option.id === view}
                  onClick={() => {
                    setView(option.id)
                    setStatus('')
                  }}
                >
                  {option.label}
                  <span className="view__count">{option.invoices?.length ?? '—'}</span>
                </button>
              ))}
            </div>

            <div className="filters">
              <div className="filter">
                <label htmlFor="customer-filter">Cliente</label>
                <span className="select-wrap">
                  <select id="customer-filter" value={customer} onChange={(event) => setCustomer(event.target.value)}>
                    <option value="">Todos</option>
                    {customers.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <ArrowDown size={14} aria-hidden="true" />
                </span>
              </div>
              <div className="filter">
                <label htmlFor="status-filter">Estado</label>
                <span className="select-wrap">
                  <select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="">Todos</option>
                    {statuses.map((value) => <option key={value} value={value}>{statusLabel(value, labels)}</option>)}
                  </select>
                  <ArrowDown size={14} aria-hidden="true" />
                </span>
              </div>
            </div>
          </div>

          {requestFailed ? (
            <div className="notice notice--ledger" role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              <div>
                <strong>No se pudo consultar la lista de facturas.</strong>
                <p>{invoices ? 'Se muestra la última consulta disponible. Usa Actualizar para reintentar.' : 'Usa Actualizar para reintentar.'}</p>
              </div>
            </div>
          ) : null}

          {filtered ? (
            filtered.length ? (
              <InvoiceTable invoices={filtered} labels={labels} onSelect={setSelectedId} />
            ) : (
              <div className="empty-table">
                <h2>{filtersActive ? 'Sin coincidencias' : 'Todavía no hay facturas'}</h2>
                {filtersActive ? (
                  <button className="refresh-button" type="button" onClick={clearFilters}>Limpiar filtros</button>
                ) : null}
              </div>
            )
          ) : refreshing ? <TablePlaceholder /> : null}

          <div className="ledger__footer">
            <span aria-live="polite">
              {filtered ? `${filtered.length} de ${invoices?.length} facturas` : '—'}
            </span>
            <div className="ledger__timestamps">
              {updatedAt ? (
                <span>Actualizado <time dateTime={updatedAt.toISOString()}>{timeFormat.format(updatedAt)}</time></span>
              ) : null}
              <span>Hora de Colombia</span>
            </div>
          </div>
        </section>
      </main>

      {selected ? <InvoiceDetails invoice={selected} labels={labels} onClose={() => setSelectedId(null)} /> : null}
    </>
  )
}
