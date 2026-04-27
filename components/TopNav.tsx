import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

type TopNavLink = {
  href: string
  label: string
}

type TopNavItem =
  | TopNavLink
  | {
      label: string
      children: TopNavLink[]
    }

export const MAIN_TOPNAV_ITEMS: TopNavItem[] = [
  {
    label: 'Electoral and Sentiment Maps',
    children: [
      { href: '/electoral-maps', label: 'UK Overview' },
      { href: '/local-2026', label: 'English Local Elections' },
      { href: '/scottish-map', label: 'Scottish Parliament Map' },
      { href: '/welsh-map', label: 'Senedd Elections' },
    ],
  },
  {
    label: 'Polling',
    children: [
      { href: '/aggregate', label: 'National Polling Average' },
      { href: '/polls', label: 'Westminster Polls' },
      { href: '/scottish-aggregate', label: 'Scottish Parliament Polling Average' },
      { href: '/scottish-polls', label: 'Scottish Parliamentary Polls' },
      { href: '/welsh-aggregate', label: 'Senedd Polling Average' },
      { href: '/welsh-polls', label: 'Senedd Polls' },
    ],
  },
  {
    label: 'Election Projections',
    children: [
      { href: '/council-projections', label: 'English Local Elections' },
      { href: '/scottish-parliament-projection', label: 'Scottish Parliamentary Elections' },
      { href: '/senedd-projection', label: 'Senedd Elections' },
    ],
  },
  { href: '/methodology', label: 'Methodology' },
]

type TopNavProps = {
  title: string
  items: TopNavItem[]
  subtitle?: ReactNode
  subtitleStyle?: CSSProperties
}

const PAGE_TITLE_STYLE: CSSProperties = {
  color: 'var(--poll-nav-ink)',
  fontFamily: 'var(--poll-nav-font-sans)',
  fontSize: 'clamp(1.9rem, 3.2vw, 2.35rem)',
  fontWeight: 800,
  letterSpacing: '-0.035em',
  lineHeight: 1.05,
}

const DEFAULT_PAGE_TITLES: Record<string, ReactNode> = {
  '/aggregate': 'UK Polling Average',
  '/council-projections': 'Projected English Local Elections',
  '/council-projections-v2': 'Projected English Local Elections',
  '/electoral-maps': 'UK Overview',
  '/local-2026': 'English Local Elections Map',
  '/local-2026-v2': 'English Local Elections Map',
  '/may-2025-council-projections': 'May 2025 Council Projections',
  '/may-2025-council-projections-v2': 'May 2025 Council Projections',
  '/may-2025-simulation': 'May 2025 Local Elections Map',
  '/may-2025-simulation-v2': 'May 2025 Local Elections Map',
  '/methodology': 'Methodology',
  '/polls': 'Westminster Polls',
  '/scottish-aggregate': 'Scottish Parliament Polling Average',
  '/scottish-map': 'Scottish Parliament Map',
  '/scottish-parliament-projection': 'Projected Scottish Parliament',
  '/scottish-polls': 'Scottish Parliamentary Polls',
  '/senedd-projection': 'Projected Senedd',
  '/welsh-aggregate': 'Senedd Polling Average',
  '/welsh-map': 'Senedd Constituency Map',
  '/welsh-polls': 'Senedd Polls',
}

export default function TopNav({ title, items, subtitle }: TopNavProps) {
  const router = useRouter()
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const navRef = useRef<HTMLElement | null>(null)
  const resolvedSubtitle =
    subtitle ?? DEFAULT_PAGE_TITLES[router.pathname] ?? (title !== 'Poll of Polls' ? title : null)

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    setOpenDropdown(null)
  }, [router.pathname])

  return (
    <header className="poll-topnav">
      <div className="poll-topnav__bar">
        <div className="poll-topnav__brand">
          <Link href="/" className="poll-topnav__title" style={{ textDecoration: 'none' }}>
            Signal
          </Link>
        </div>
        <nav className="poll-topnav__links" aria-label="Primary" ref={navRef}>
          {items.map(item => {
            if ('children' in item) {
              const isActive = item.children.some(child => child.href === router.pathname)
              const buttonClass = isActive
                ? 'poll-topnav__link poll-topnav__link--active poll-topnav__dropdown-toggle'
                : 'poll-topnav__link poll-topnav__dropdown-toggle'
              const isOpen = openDropdown === item.label
              const dropdownClass = isOpen
                ? 'poll-topnav__dropdown poll-topnav__dropdown--open'
                : 'poll-topnav__dropdown'
              return (
                <div
                  key={item.label}
                  className={dropdownClass}
                  onMouseEnter={() => setOpenDropdown(item.label)}
                  onMouseLeave={() => setOpenDropdown(null)}
                >
                  <button
                    type="button"
                    className={buttonClass}
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                    onClick={() => setOpenDropdown(isOpen ? null : item.label)}
                  >
                    {item.label}
                    <span className="poll-topnav__caret" aria-hidden="true" />
                  </button>
                  <div className="poll-topnav__dropdown-menu" role="menu">
                    {item.children.map(child => {
                      const isChildActive = child.href === router.pathname
                      const childClass = isChildActive
                        ? 'poll-topnav__dropdown-link poll-topnav__link--active'
                        : 'poll-topnav__dropdown-link'
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={childClass}
                          role="menuitem"
                          onClick={() => setOpenDropdown(null)}
                        >
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            }
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
        <a
          href="https://www.alpacacommunications.com/"
          className="poll-topnav__logo-link"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Alpaca Communications"
        >
          <img
            src="/alpaca_icon_WHITE.png"
            alt=""
            aria-hidden="true"
            className="poll-topnav__logo"
          />
        </a>
      </div>
      {resolvedSubtitle ? (
        <div className="poll-topnav__subtitle" style={PAGE_TITLE_STYLE}>
          {resolvedSubtitle}
        </div>
      ) : null}
    </header>
  )
}
