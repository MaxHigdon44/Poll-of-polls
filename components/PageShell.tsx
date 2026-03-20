import type { ReactNode } from 'react'

type PageShellProps = {
  children: ReactNode
}

export default function PageShell({ children }: PageShellProps) {
  return <div className="poll-page-shell">{children}</div>
}
