import { useCallback, useEffect, useRef, useState } from 'react'
import type { Invoice, StatusLabels } from './invoices'
import { apiFetch, credentialsRejected, readInvoices } from './reviewApi'
import type { ReviewSession } from './reviewApi'

const refreshInterval = 30_000

export function useInvoices(session?: ReviewSession, onAuthenticationFailed?: () => void) {
  const authorization = session?.authorization
  const [invoices, setInvoices] = useState<Invoice[] | null>(session?.invoices ?? null)
  const [labels, setLabels] = useState<StatusLabels>({})
  const [updatedAt, setUpdatedAt] = useState<Date | null>(() => session ? new Date() : null)
  const [refreshing, setRefreshing] = useState(!session)
  const [requestFailed, setRequestFailed] = useState(false)
  const request = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (request.current) return

    const controller = new AbortController()
    request.current = controller
    setRefreshing(true)

    try {
      const response = await apiFetch('/api/invoices', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
      }, authorization)
      if (authorization && credentialsRejected(response) && !controller.signal.aborted) {
        onAuthenticationFailed?.()
        return
      }

      const records = await readInvoices(response)
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
  }, [authorization, onAuthenticationFailed])

  useEffect(() => {
    if (!session) void refresh()
    const labelsRequest = new AbortController()
    void apiFetch('/api/statuses', { cache: 'no-store', signal: labelsRequest.signal }, authorization)
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
  }, [authorization, refresh, session])

  return { invoices, labels, updatedAt, refreshing, requestFailed, refresh }
}
