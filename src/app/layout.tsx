import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { DemoStateProvider } from '@/state/DemoStateProvider';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: 'ResourceFlow — Portfolio Demo',
  description:
    'An independently built, frontend-only demonstration of server resource requests, approval workflow, role-based permissions and resource allocation. Simulated data only.',
  robots: { index: false, follow: false },
  // Hand-drawn SVG served from public/. No external image, font or request.
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <ToastProvider>
            <DemoStateProvider>
              <AppShell>{children}</AppShell>
            </DemoStateProvider>
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
