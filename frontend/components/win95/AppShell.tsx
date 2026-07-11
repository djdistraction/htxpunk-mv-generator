'use client'

import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { Win95Button, Win95Modal } from './Win95Primitives'

// Prefer explicit public API origin; otherwise health-check the loopback
// backend (same host the Next rewrite targets in next.config.js).
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

type MenuKey = 'file' | 'edit' | 'view' | 'tools' | 'help' | null

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [openMenu, setOpenMenu] = useState<MenuKey>(null)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)
  const [modal, setModal] = useState<{ title: string; body: string } | null>(null)

  const projectId = useMemo(() => {
    const match = pathname?.match(/^\/projects\/([^/]+)/)
    if (!match || match[1] === 'new') return null
    return match[1]
  }, [pathname])

  const checkHealth = useCallback(async (showModal = false) => {
    try {
      const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' })
      const ok = res.ok
      setBackendOk(ok)
      if (showModal) {
        setModal({
          title: 'Backend Health',
          body: ok
            ? `Backend is reachable at ${API_BASE}.\nStatus: OK`
            : `Backend responded with HTTP ${res.status} at ${API_BASE}.`,
        })
      }
    } catch {
      setBackendOk(false)
      if (showModal) {
        setModal({
          title: 'Backend Health',
          body: `Could not reach the backend at ${API_BASE}.\n\nStart it with:\n  cd backend\n  uvicorn main:app --port 8000`,
        })
      }
    }
  }, [])

  useEffect(() => {
    checkHealth(false)
    const interval = setInterval(() => checkHealth(false), 15000)
    return () => clearInterval(interval)
  }, [checkHealth])

  useEffect(() => {
    setOpenMenu(null)
  }, [pathname])

  const closeMenus = () => setOpenMenu(null)
  const toggleMenu = (key: MenuKey) => setOpenMenu(prev => (prev === key ? null : key))

  const connLabel = backendOk === null ? 'Checking…' : backendOk ? 'Connected' : 'Offline'
  const connClass = backendOk === null ? 'muted' : backendOk ? 'ok' : 'error'

  return (
    <div className="win95-desktop">
      <div className="win95-app">
        <header className="win95-titlebar">
          <div className="win95-titlebar-left">
            <span className="win95-app-icon" aria-hidden />
            <span className="win95-titlebar-text">HTXpunk Productions — Music Video Generator</span>
          </div>
          <div className="win95-titlebar-controls" aria-hidden>
            <span className="win95-titlebar-btn">_</span>
            <span className="win95-titlebar-btn">□</span>
            <span className="win95-titlebar-btn">✕</span>
          </div>
        </header>

        {openMenu && <div className="win95-menu-scrim" onClick={closeMenus} />}

        <nav className="win95-menubar" aria-label="Application menu">
          <Menu
            label="File"
            open={openMenu === 'file'}
            onToggle={() => toggleMenu('file')}
            items={[
              { label: 'New Project', onClick: () => { closeMenus(); router.push('/projects/new') } },
              { label: 'Open Projects…', onClick: () => { closeMenus(); router.push('/') } },
              { divider: true },
              { label: 'Settings…', onClick: () => { closeMenus(); router.push('/settings') } },
            ]}
          />
          <Menu
            label="View"
            open={openMenu === 'view'}
            onToggle={() => toggleMenu('view')}
            items={[
              { label: 'Refresh Page', onClick: () => { closeMenus(); window.location.reload() } },
              ...(projectId
                ? [{ label: 'Open Current Project', onClick: () => { closeMenus(); router.push(`/projects/${projectId}`) } }]
                : []),
            ]}
          />
          <Menu
            label="Tools"
            open={openMenu === 'tools'}
            onToggle={() => toggleMenu('tools')}
            items={[
              { label: 'Check Backend Health', onClick: () => { closeMenus(); void checkHealth(true) } },
              ...(projectId
                ? [{
                    label: 'Copy Project ID',
                    onClick: async () => {
                      closeMenus()
                      try {
                        await navigator.clipboard.writeText(projectId)
                        setModal({ title: 'Copied', body: `Project ID copied:\n${projectId}` })
                      } catch {
                        setModal({ title: 'Project ID', body: projectId })
                      }
                    },
                  }]
                : []),
              { label: 'API Settings…', onClick: () => { closeMenus(); router.push('/settings') } },
            ]}
          />
          <Menu
            label="Help"
            open={openMenu === 'help'}
            onToggle={() => toggleMenu('help')}
            items={[
              {
                label: 'About HTXpunk MV Generator',
                onClick: () => {
                  closeMenus()
                  setModal({
                    title: 'About',
                    body:
                      'HTXpunk Productions — Music Video Generator\n\n' +
                      'A production workbook for turning a song into a finished music video.\n' +
                      'Upload a song, approve each stage, then export the final result.\n\n' +
                      'Built for sturdy local production work — not a SaaS landing page.',
                  })
                },
              },
            ]}
          />
        </nav>

        <div className="win95-toolbar">
          <Win95Button onClick={() => router.push('/projects/new')}>New Project</Win95Button>
          <Win95Button onClick={() => router.push('/')}>Projects</Win95Button>
          <Win95Button onClick={() => router.push('/settings')}>Settings</Win95Button>
          <span className="win95-toolbar-sep" />
          <span className="win95-toolbar-meta">API: {API_BASE}</span>
          <span className={`win95-conn win95-conn-${connClass}`}>● {connLabel}</span>
          <div className="win95-toolbar-spacer" />
          {projectId ? (
            <span className="win95-toolbar-meta">Project: {projectId.slice(0, 8)}…</span>
          ) : (
            <span className="win95-toolbar-meta">Ready</span>
          )}
        </div>

        <main className="win95-content">{children}</main>

        <footer className="win95-statusbar">
          <span>HTXpunk Productions</span>
          <span className="win95-statusbar-sep" />
          <span>{pathname || '/'}</span>
          <div className="win95-toolbar-spacer" />
          <span className={`win95-conn win95-conn-${connClass}`}>{connLabel}</span>
        </footer>
      </div>

      <Win95Modal
        open={Boolean(modal)}
        title={modal?.title || ''}
        onClose={() => setModal(null)}
        footer={<Win95Button onClick={() => setModal(null)}>OK</Win95Button>}
      >
        <pre className="win95-pre">{modal?.body}</pre>
      </Win95Modal>
    </div>
  )
}

function Menu({
  label,
  open,
  onToggle,
  items,
}: {
  label: string
  open: boolean
  onToggle: () => void
  items: Array<{ label?: string; onClick?: () => void; divider?: boolean }>
}) {
  return (
    <div className="win95-menu">
      <button
        type="button"
        className={`win95-menu-trigger ${open ? 'is-open' : ''}`}
        onClick={onToggle}
      >
        {label}
      </button>
      {open && (
        <div className="win95-menu-dropdown">
          {items.map((item, i) =>
            item.divider ? (
              <div key={`d-${i}`} className="win95-menu-divider" />
            ) : (
              <button key={item.label} type="button" className="win95-menu-item" onClick={item.onClick}>
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
