'use client';

import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';

export interface Column<Row> {
  key: string;
  header: string;
  /** Cell content. Keep it short; the same value is reused on small screens. */
  cell: (row: Row) => ReactNode;
  /** Hide this column in the stacked card layout used on narrow screens. */
  hideOnMobile?: boolean;
  align?: 'left' | 'right';
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  caption: string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Rendered at the end of each row / card, e.g. a details link. */
  rowAction?: (row: Row) => ReactNode;
}

/**
 * A real <table> on wide screens and a stack of definition-list cards below
 * `md`, so narrow screens never get a horizontally scrolling table. Loading and
 * empty states are part of the component rather than something each screen
 * reinvents.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  loading = false,
  emptyTitle = 'Nothing to show yet',
  emptyDescription = 'There is no data for this view with the current demo session.',
  emptyAction,
  rowAction,
}: DataTableProps<Row>) {
  if (loading) {
    return (
      <div className="space-y-2 p-4" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading {caption}</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-elevated" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-4">
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  return (
    <>
      {/* The table keeps its natural minimum width; this wrapper scrolls it
          inside the card instead of letting it paint past the card border. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-left">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-muted ${
                    column.align === 'right' ? 'text-right' : ''
                  }`}
                >
                  {column.header}
                </th>
              ))}
              {/* w-px + nowrap shrinks this column to exactly the width of its
                  control, leaving the remaining space to the data columns. */}
              {rowAction ? <th scope="col" className="w-px whitespace-nowrap px-5 py-2.5" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line/70 last:border-0 hover:bg-elevated/60">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-5 py-3 align-top ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}
                  >
                    {column.cell(row)}
                  </td>
                ))}
                {rowAction ? (
                  <td className="w-px whitespace-nowrap px-5 py-3 text-right align-top">{rowAction(row)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="px-4 py-3">
            <dl className="space-y-1.5 text-sm">
              {columns
                .filter((column) => !column.hideOnMobile)
                .map((column) => (
                  <div key={column.key} className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-xs uppercase tracking-wide text-muted">{column.header}</dt>
                    <dd className="min-w-0 text-right">{column.cell(row)}</dd>
                  </div>
                ))}
            </dl>
            {rowAction ? <div className="mt-2 text-right">{rowAction(row)}</div> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
