'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { STORAGE_KEY } from '@/lib/storage';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Last line of defence: if any screen throws, the user still gets a usable page
 * and a way back to known-good demo data instead of a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No telemetry: this demo never sends anything anywhere.
    console.error('[ResourceFlow demo] render error', error, info.componentStack);
  }

  private handleReset = (): void => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be blocked; reloading with in-memory seed data still works.
    }
    window.location.href = '/';
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Something went wrong in the demo</h1>
        <p className="mt-2 text-sm text-muted">
          The page hit an unexpected error. Your stored demo data has not been changed. You can restore
          the default sample data and start again.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-elevated p-3 text-left text-xs text-muted">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={this.handleReset}
          className="mt-5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
        >
          Reset demo data and reload
        </button>
      </div>
    );
  }
}
