import type { ReactNode } from 'react'

type PageShellProps = {
  children: ReactNode
}

export default function PageShell({ children }: PageShellProps) {
  return (
    <div className="poll-page-shell">
      {children}
      <footer className="poll-site-footer">
        <p className="poll-site-footer-copy">
          &copy; 2026 Alpaca Communications Ltd. All rights reserved. Signal is a digital polling
          projector developed by Alpaca Communications Ltd. Polling projections may change.
        </p>
        <div className="poll-site-footer-links">
          <a
            href="https://www.alpacacommunications.com/privacy-policy"
            target="_blank"
            rel="noreferrer"
          >
            Privacy Policy
          </a>
          <a
            href="https://www.alpacacommunications.com/modern-slavery-statement"
            target="_blank"
            rel="noreferrer"
          >
            Modern Slavery Statement
          </a>
        </div>
      </footer>
    </div>
  )
}
