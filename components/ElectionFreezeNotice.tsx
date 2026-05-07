'use client'

import { useState } from 'react'

const NOTICE_TEXT =
  'These final projections were calculated before polls closed on May 7 2026. The site will be updated once all election results are in.'

export default function ElectionFreezeNotice() {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div
      style={{
        position: 'fixed',
        right: '1rem',
        bottom: '1rem',
        zIndex: 1000,
        maxWidth: 'min(26rem, calc(100vw - 2rem))',
        padding: '0.85rem 1rem',
        borderRadius: '14px',
        background: '#172033',
        color: '#f8fafc',
        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.28)',
        border: '1px solid rgba(248, 250, 252, 0.16)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ flex: 1, fontSize: '0.92rem', lineHeight: 1.45 }}>{NOTICE_TEXT}</div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss notice"
          style={{
            border: 'none',
            background: 'transparent',
            color: '#f8fafc',
            cursor: 'pointer',
            fontSize: '1rem',
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
