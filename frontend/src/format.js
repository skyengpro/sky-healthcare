import { lang } from './i18n'
import { session } from './session'

const locale = () => (lang.value === 'fr' ? 'fr-FR' : 'en-GB')

export function num(n, digits = 0) {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(Number(n) || 0)
}

export function money(n) {
  try {
    return new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency: session.currency || 'XAF',
      maximumFractionDigits: 0,
    }).format(Number(n) || 0)
  } catch {
    return num(n)
  }
}

export function date(d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!d) return '—'
  const value = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00` : d.replace(' ', 'T')) : d
  return new Intl.DateTimeFormat(locale(), opts).format(value)
}

export const shortDate = (d) => date(d, { day: 'numeric', month: 'short' })

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysUntil(d) {
  if (!d) return null
  const one = new Date(`${today()}T00:00:00`)
  const two = new Date(`${d}T00:00:00`)
  return Math.round((two - one) / 86400000)
}

export function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

/** Download rows as a CSV file (opens in Excel). */
export function downloadCsv(filename, header, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
