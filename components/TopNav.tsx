import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
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
      { href: '/polls', label: 'Recent UK Polls' },
      { href: '/scottish-aggregate', label: 'Scottish Polling Average' },
      { href: '/scottish-polls', label: 'Recent Scottish Polls' },
      { href: '/welsh-aggregate', label: 'Welsh Polling Average' },
      { href: '/welsh-polls', label: 'Recent Welsh Polls' },
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

export default function TopNav({ title, items, subtitle, subtitleStyle }: TopNavProps) {
  const router = useRouter()
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  return (
    <header className="poll-topnav">
      <div className="poll-topnav__bar">
        <div className="poll-topnav__brand">
          <h1 className="poll-topnav__title">Signal</h1>
        </div>
        <nav className="poll-topnav__links" aria-label="Primary">
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
                        <Link key={child.href} href={child.href} className={childClass} role="menuitem">
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
      </div>
      {subtitle ? (
        <div className="poll-topnav__subtitle" style={subtitleStyle}>
          {subtitle}
        </div>
      ) : null}
    </header>
  )
}
