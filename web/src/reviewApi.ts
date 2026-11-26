import type { Invoice } from './invoices'

export type ReviewSession = {
  authorization: string
  invoices: Invoice[]
}

type ReviewPath = '/api/invoices' | '/api/statuses' | '/api/demo-correos' | `/api/demo-correos/${string}`

export const reviewApiOrigin = import.meta.env.VITE_REVIEW_API_ORIGIN

export function apiFetch(path: ReviewPath, options: RequestInit, authorization?: string) {
  if (!authorization) return fetch(path, options)
  if (!reviewApiOrigin) throw new Error('Falta la dirección de la API de revisión')

  const headers = new Headers(options.headers)
  headers.set('Authorization', authorization)
  return fetch(new URL(path, reviewApiOrigin), {
    ...options,
    headers,
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  })
}

export function makeAuthorization(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
  return `Basic ${encoded}`
}

export function credentialsRejected(response: Response) {
  return response.status === 401 || response.status === 403
}

export async function readInvoices(response: Response): Promise<Invoice[]> {
  if (!response.ok) throw new Error('Error de consulta de facturas')

  const records: Invoice[] = await response.json()
  if (!Array.isArray(records)) throw new Error('Formato de respuesta inesperado')
  return records
}
