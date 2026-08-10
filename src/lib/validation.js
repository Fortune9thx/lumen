export function parseAmount(value) {
  if (!value) return null
  if (String(value).trim().startsWith('-')) return null
  const cleaned = value.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function isValidAmount(value) {
  const n = parseAmount(value)
  return n !== null && n > 0
}

/** Whole positive integer only — GEN amounts are whole numbers (GenVM calldata has no float type). */
export function isValidWholeGenAmount(value) {
  if (value === '' || value === null || value === undefined) return false
  return /^\d+$/.test(String(value).trim()) && Number(value) > 0
}

export function isValidUrl(value) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Runs `checks` (each [key, predicate, message]) against `values`, returns { [key]: message } for failures. */
export function validate(values, checks) {
  const errors = {}
  for (const [key, predicate, message] of checks) {
    if (!predicate(values[key], values)) {
      errors[key] = message
    }
  }
  return errors
}
