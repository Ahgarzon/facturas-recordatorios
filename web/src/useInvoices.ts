import { useCallback, useEffect, useRef, useState } from 'react'
import type { Invoice, StatusLabels } from './invoices'

const refreshInterval = 30_000

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [labels, setLabels] = useState<StatusLabels>({})
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(true)
  const [requestFailed, setRequestFailed] = useState(false)
  const request = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (request.current) return

    const controller = new AbortController()
    request.current = controller
    setRefreshing(true)

    try {
      const response = await fetch('/api/invoices', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
      })
      if (!response.ok) throw new Error('Error de consulta de facturas')

      const records: Invoice[] = await response.json()
      if (!Array.isArray(records)) throw new Error('Formato de respuesta inesperado')
      if (controller.signal.aborted) return

      setInvoices(records)
      setUpdatedAt(new Date())
      setRequestFailed(false)
    } catch {
      if (!controller.signal.aborted) setRequestFailed(true)
    } finally {
      if (request.current === controller) {
        request.current = null
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    const labelsRequest = new AbortController()
    void fetch('/api/statuses', { signal: labelsRequest.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((configuredLabels: StatusLabels | null) => {
        if (configuredLabels && !labelsRequest.signal.aborted) setLabels(configuredLabels)
      })
      .catch(() => {
        // The invoice status still has a readable label if the catalog is unavailable.
      })
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, refreshInterval)

    return () => {
      window.clearInterval(interval)
      labelsRequest.abort()
      request.current?.abort()
      request.current = null
    }
  }, [refresh])

  return { invoices, labels, updatedAt, refreshing, requestFailed, refresh }
}
