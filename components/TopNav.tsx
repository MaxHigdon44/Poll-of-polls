import Link from 'next/link'
import { useRouter } from 'next/router'
import type { CSSProperties, ReactNode } from 'react'

type TopNavItem = {
  href: string
  label: string
}

export const MAIN_TOPNAV_ITEMS: TopNavItem[] = [
  { href: '/aggregate', label: 'National Polling Average' },
  { href: '/polls', label: 'Recent UK Polls' },
  { href: '/may-2025-simulation', label: 'May 2025 Simulation' },
  { href: '/may-2025-council-projections', label: 'May 2025 Council Projections' },
  { href: '/local-2026', label: 'May 2026 Local Elections Projections' },
  { href: '/council-projections', label: 'Council Projections' },
  { href: '/methodology', label: 'Methodology' },
]

type TopNavProps = {
  title: string
  items: TopNavItem[]
  subtitle?: ReactNode
  subtitleStyle?: CSSProperties
}

export default function TopNav({ title, items, subtitle, subtitleStyle }: TopNavProps) {
  const router = useRouter()

  return (
    <header className="poll-topnav">
      <div className="poll-topnav__bar">
        <div className="poll-topnav__brand">
          <h1 className="poll-topnav__title">Poll of Polls</h1>
        </div>
        <nav className="poll-topnav__links" aria-label="Primary">
          {items.map(item => {
            const isActive = router.pathname === item.href
            const className = isActive
              ? 'poll-topnav__link poll-topnav__link--active'
              : 'poll-topnav__link'

            return (
              <Link key={item.href} href={item.href} className={className}>
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
      {subtitle ? (
        <div className="poll-topnav__subtitle" style={subtitleStyle}>
          {subtitle}
        </div>
      ) : null}
    </header>
  )
}
