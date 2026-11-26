import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function DetailDrawer({
  title,
  subtitle,
  closeLabel,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  closeLabel: string
  onClose: () => void
  children: ReactNode
}) {
  const headingId = useId()
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  return (
    <dialog className="invoice-detail" aria-labelledby={headingId} ref={dialog} onClose={onClose}>
      <div className="invoice-detail__header">
        <div>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
          <h2 id={headingId}>{title}</h2>
        </div>
        <form method="dialog">
          <button className="icon-button" type="submit" aria-label={closeLabel}>
            <X size={20} aria-hidden="true" />
          </button>
        </form>
      </div>
      {children}
    </dialog>
  )
}
