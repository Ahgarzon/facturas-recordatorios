export type Reminder = {
  fromStatus: string
  toStatus: string
  sentAt: string
  messageId: string
}

export type Invoice = {
  id: string
  customer: string
  number: string
  amount: number
  currency: string
  status: string
  nextReminderAt: string | null
  history: Reminder[]
  reviewRequired: boolean
  lastFailureAt?: string | null
  reviewMessageId?: string | null
}

const dateOptions = {
  timeZone: 'America/Bogota',
  dateStyle: 'medium',
  timeStyle: 'short',
} satisfies Intl.DateTimeFormatOptions

const dateFormat = new Intl.DateTimeFormat('es-CO', dateOptions)

export const timeFormat = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  timeStyle: 'medium',
})

export type StatusLabels = Record<string, string>

const fallbackStatusLabels: StatusLabels = {
  primerrecordatorio: 'Primer recordatorio',
  segundorecordatorio: 'Segundo recordatorio',
  desactivado: 'Desactivada',
}

export function statusLabel(status: string, labels: StatusLabels) {
  const words = status.replace(/(.+)recordatorio$/i, '$1 recordatorio')
    .replaceAll(/[-_]+/g, ' ')
  if (Object.hasOwn(labels, status) && typeof labels[status] === 'string') return labels[status]
  if (Object.hasOwn(fallbackStatusLabels, status)) return fallbackStatusLabels[status]
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function statusTone(status: string) {
  if (status === 'primerrecordatorio') return 'first'
  if (status.endsWith('recordatorio')) return 'reminder'
  return 'neutral'
}

export function formatDate(value: string) {
  return dateFormat.format(new Date(value))
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    maximumFractionDigits: 2,
  }).format(amount)
}

export function reminderSchedule(invoice: Invoice) {
  if (invoice.reviewRequired) return 'En pausa por revisión'
  return invoice.nextReminderAt ? formatDate(invoice.nextReminderAt) : 'Sin aviso programado'
}
