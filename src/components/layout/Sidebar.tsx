'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  href: string;
  label: string;
  hint: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', hint: 'Overview of the simulated cluster' },
  { href: '/requests/', label: 'Resource Requests', hint: 'Every request you may see' },
  { href: '/requests/new/', label: 'Create Request', hint: 'File a new request' },
  { href: '/approvals/', label: 'Approval Queue', hint: 'Requests awaiting a decision' },
  { href: '/capacity/', label: 'Resource Capacity', hint: 'Pool utilisation' },
  { href: '/allocations/', label: 'Allocations & Returns', hint: 'Active and closed allocations' },
  { href: '/roles/', label: 'Roles & Permissions', hint: 'What each role may do' },
  { href: '/audit/', label: 'Demo Audit Trail', hint: 'Every action, allowed or denied' },
  { href: '/settings/reset/', label: 'Reset Demo Data', hint: 'Restore default sample data' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href);
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '/';

  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? 'bg-accent-soft font-medium text-accent'
                : 'text-muted hover:bg-elevated hover:text-fg'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
