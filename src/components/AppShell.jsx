import { NavLink, Outlet } from 'react-router-dom'
import { Wordmark } from './Splash'
import { useAuth } from '../contexts/AuthContext'

const NAV = [
  { to: '/', label: 'Home', end: true, icon: IconHome },
  { to: '/tracks', label: 'Tracks', icon: IconDisc },
  { to: '/send', label: 'Send', icon: IconSend, primary: true },
  { to: '/contacts', label: 'Labels', icon: IconContacts },
  { to: '/you', label: 'You', icon: IconUser },
]

export default function AppShell() {
  const { user, signOut } = useAuth()

  return (
    <div className="mx-auto flex min-h-dvh max-w-screen-sm flex-col bg-ink">
      <header className="safe-top sticky top-0 z-10 flex items-center justify-between border-b border-line/70 bg-ink/80 px-4 pb-3 backdrop-blur">
        <Wordmark className="text-lg" />
        <button
          onClick={signOut}
          className="text-xs text-muted transition-colors hover:text-text"
          title={user?.email}
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 px-4 py-5">
        <Outlet />
      </main>

      <nav className="safe-bottom sticky bottom-0 z-10 border-t border-line/70 bg-ink/90 backdrop-blur">
        <ul className="mx-auto flex max-w-screen-sm items-end justify-around px-2 pt-2">
          {NAV.map(({ to, label, end, icon: Icon, primary }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'flex flex-col items-center gap-1 rounded-lg py-1.5 text-[0.65rem] font-medium transition-colors',
                    primary
                      ? 'text-ink'
                      : isActive
                        ? 'text-accent'
                        : 'text-muted hover:text-text',
                  ].join(' ')
                }
              >
                {({ isActive }) =>
                  primary ? (
                    <>
                      <span className="-mt-5 grid size-12 place-items-center rounded-full bg-accent shadow-lg shadow-accent/20 ring-4 ring-ink">
                        <Icon className="size-6" />
                      </span>
                      <span className="text-accent">{label}</span>
                    </>
                  ) : (
                    <>
                      <Icon className={`size-5 ${isActive ? 'text-accent' : ''}`} />
                      {label}
                    </>
                  )
                }
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/* Minimal inline icons (stroke = currentColor) so there's no icon-lib dependency. */
function base(props) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ...props,
  }
}
function IconHome(props) {
  return (
    <svg {...base(props)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  )
}
function IconDisc(props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}
function IconSend(props) {
  return (
    <svg {...base(props)}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  )
}
function IconContacts(props) {
  return (
    <svg {...base(props)}>
      <path d="M4 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4z" />
      <path d="M4 9h16M9 4v16" />
    </svg>
  )
}
function IconUser(props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
    </svg>
  )
}
