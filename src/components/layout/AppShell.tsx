'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DemoBanner } from './DemoBanner';
import { RoleSwitcher } from './RoleSwitcher';
import { SidebarNav } from './Sidebar';
import { useDemoState } from '@/state/DemoStateProvider';
import { ToastViewport } from '@/components/ui/Toast';

const APP_NAME = 'ResourceFlow';
const APP_TAGLINE = 'Server resource request & allocation (portfolio demo)';

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const { notice, dismissNotice, persistence, hydrated } = useDemoState();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">Skip to main content</a>
      <DemoBanner />

      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
          <button
            type="button"
            className="rounded-lg border border-line p-2 lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>

          <Link href="/" className="flex items-center gap-2.5">
            <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-fg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="6" rx="2" />
                <rect x="3" y="14" width="18" height="6" rx="2" />
                <path d="M7 7h.01M7 17h.01" />
              </svg>
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight">{APP_NAME}</span>
              <span className="hidden text-xs text-muted sm:block">{APP_TAGLINE}</span>
            </span>
          </Link>

          <div className="ml-auto w-full sm:w-auto">
            <RoleSwitcher />
          </div>
        </div>
      </header>

      {notice ? (
        <div className="mx-auto max-w-[1400px] px-4 pt-4">
          <div
            role="status"
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-sm text-info"
          >
            <p className="max-w-3xl">{notice}</p>
            <button type="button" onClick={dismissNotice} className="text-xs font-medium underline underline-offset-2">
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {hydrated && persistence !== 'READY' ? (
        <div className="mx-auto max-w-[1400px] px-4 pt-4">
          <p role="status" className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            {persistence === 'UNAVAILABLE'
              ? 'Browser storage is unavailable in this context, so the demo runs from memory. Nothing is written, and nothing already stored will be overwritten.'
              : 'Browser storage is readable but not writable right now. You can still explore the workflow, but changes will not be saved and existing data will be left untouched.'}
          </p>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-6">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-[5.5rem] rounded-2xl border border-line bg-surface shadow-card">
            <SidebarNav />
          </div>
        </aside>

        {menuOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-fg/40"
              onClick={() => setMenuOpen(false)}
            />
            <div id="mobile-nav" className="absolute inset-y-0 left-0 w-72 max-w-[85%] overflow-y-auto border-r border-line bg-surface">
              <p className="border-b border-line px-5 py-4 text-sm font-semibold">{APP_NAME}</p>
              <SidebarNav onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        ) : null}

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      <ToastViewport />

      <footer className="border-t border-line">
        <p className="mx-auto max-w-[1400px] px-4 py-6 text-xs text-muted">
          Independent portfolio demonstration. Frontend-only, no backend, no external services, no real
          personal data. Not affiliated with, endorsed by, or representing any institution or production system.
        </p>
      </footer>
    </div>
  );
}
