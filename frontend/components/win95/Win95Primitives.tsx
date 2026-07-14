'use client'

import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
  forwardRef,
} from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: 'default' | 'primary'
}

export function Win95Button({
  children,
  className = '',
  variant = 'default',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`win95-btn ${variant === 'primary' ? 'win95-btn-primary' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  )
}

export function Win95GroupBox({
  title,
  children,
  className = '',
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <fieldset className={`win95-groupbox ${className}`.trim()}>
      {title ? <legend className="win95-groupbox-title">{title}</legend> : null}
      {children}
    </fieldset>
  )
}

export function Win95Panel({
  children,
  className = '',
  inset = false,
}: {
  children: ReactNode
  className?: string
  inset?: boolean
}) {
  return (
    <div className={`${inset ? 'win95-inset' : 'win95-outset'} ${className}`.trim()}>
      {children}
    </div>
  )
}

export function Win95Progress({
  value,
  label,
}: {
  value: number
  label?: string
}) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="win95-progress-wrap">
      {label ? <div className="win95-progress-label">{label}</div> : null}
      <div className="win95-progress" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <div className="win95-progress-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}

export function Win95StatusBadge({
  status,
  children,
}: {
  status: 'ok' | 'warn' | 'error' | 'info' | 'muted' | 'running'
  children: ReactNode
}) {
  return <span className={`win95-status win95-status-${status}`}>{children}</span>
}

export const Win95Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Win95Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`win95-input ${className}`.trim()} {...props} />
  }
)

export const Win95Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Win95Textarea({ className = '', ...props }, ref) {
    return <textarea ref={ref} className={`win95-textarea ${className}`.trim()} {...props} />
  }
)

export function Win95Select({
  className = '',
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`win95-select ${className}`.trim()} {...props}>
      {children}
    </select>
  )
}

export function Win95Label({
  children,
  className = '',
  htmlFor,
}: {
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <label htmlFor={htmlFor} className={`win95-label ${className}`.trim()}>
      {children}
    </label>
  )
}

export function Win95Alert({
  tone = 'error',
  title,
  children,
  onDismiss,
}: {
  tone?: 'error' | 'warn' | 'info' | 'success'
  title?: string
  children: ReactNode
  onDismiss?: () => void
}) {
  return (
    <div className={`win95-alert win95-alert-${tone}`}>
      <div className="win95-alert-body">
        {title ? <div className="win95-alert-title">{title}</div> : null}
        <div>{children}</div>
      </div>
      {onDismiss ? (
        <Win95Button onClick={onDismiss} className="win95-btn-sm">
          Dismiss
        </Win95Button>
      ) : null}
    </div>
  )
}

export function Win95Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
}) {
  if (!open) return null
  return (
    <div className="win95-modal-backdrop" onClick={onClose}>
      <div
        className="win95-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
      >
        <div className="win95-titlebar">
          <span className="win95-titlebar-text">{title}</span>
          <button type="button" className="win95-titlebar-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="win95-modal-body">{children}</div>
        {footer ? <div className="win95-modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}
