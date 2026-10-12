'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { can } from '@/lib/permissions';
import { createSeedState } from '@/lib/seed';
import { CORRUPT_KEY_PREFIX, STORAGE_KEY, listCorruptBackups } from '@/lib/storage';
import { ROLE_LABEL } from '@/lib/types';
import { useDemoState } from '@/state/DemoStateProvider';

export default function ResetDemoPage() {
  const { state, activeUser, hydrated, persistence, dispatch } = useDemoState();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [backups, setBackups] = useState<string[]>([]);

  // Storage is only touched after mount, so the server and client renders match.
  useEffect(() => {
    setBackups(listCorruptBackups());
  }, [state]);

  const permission = can(activeUser, 'demo:reset');
  const seed = createSeedState();

  const current = [
    { label: 'Requests', now: state.requests.length, after: seed.requests.length },
    { label: 'Allocations', now: state.allocations.length, after: seed.allocations.length },
    { label: 'Audit entries', now: state.auditLog.length, after: seed.auditLog.length + 1 },
    { label: 'Resource pools', now: state.pools.length, after: seed.pools.length },
    { label: 'Demo users', now: state.users.length, after: seed.users.length },
  ];

  function confirmReset() {
    if (working) return;
    setWorking(true);
    setFailure(null);
    try {
      const outcome = dispatch({ type: 'demo:reset' });

      if (!outcome.ok) {
        setFailure(outcome.reason ?? 'The workflow refused the reset.');
        return;
      }
      if (!outcome.persisted) {
        setFailure(
          'The demo data was reset in this browser session but could not be saved to local storage. ' +
            'Reloading the page will bring back whatever is still stored.',
        );
        return;
      }
      setConfirmOpen(false);
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Reset Demo Data"
        description="Put this browser's copy of the demo back to the sample data it ships with."
      />

      <Card className="mb-4">
        <CardHeader title="What a reset does" description="Exactly what happens, with nothing glossed over." />
        <CardBody>
          <ul className="space-y-2 text-sm">
            <li>
              <span className="font-medium">Requests, allocations, pools and demo users</span> are replaced with
              the built-in sample data. Anything you created in this browser is discarded.
            </li>
            <li>
              <span className="font-medium text-danger">The audit trail is replaced too.</span> The reset does not
              keep your current history: afterwards the log contains the {seed.auditLog.length} sample entries
              plus one new entry recording the reset itself, so there is always evidence that it happened.
            </li>
            <li>
              <span className="font-medium">The active persona becomes you</span> — whoever performed the reset.
            </li>
            <li>
              <span className="font-medium">Backups of damaged data are left alone.</span> Keys beginning{' '}
              <code className="font-mono text-xs">{CORRUPT_KEY_PREFIX}</code> are never written or removed by a
              reset; only <code className="font-mono text-xs">{STORAGE_KEY}</code> is replaced.
            </li>
            <li>
              This affects <span className="font-medium">this browser only</span>. There is no server and no
              other copy of the data.
            </li>
          </ul>

          <table className="mt-5 w-full border-collapse text-sm">
            <caption className="sr-only">What this browser holds now and what it will hold after a reset</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-2">Data</th>
                <th scope="col" className="py-2 text-right">Now</th>
                <th scope="col" className="py-2 text-right">After reset</th>
              </tr>
            </thead>
            <tbody>
              {current.map((row) => (
                <tr key={row.label} className="border-b border-line/70 last:border-0">
                  <td className="py-2">{row.label}</td>
                  <td className="py-2 text-right tabular-nums">{hydrated ? row.now : '—'}</td>
                  <td className="py-2 text-right tabular-nums">{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {hydrated && backups.length > 0 ? (
            <p className="mt-4 rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-sm text-info">
              {backups.length} backup {backups.length === 1 ? 'copy' : 'copies'} of previously damaged demo data
              {backups.length === 1 ? ' is' : ' are'} stored in this browser. A reset leaves{' '}
              {backups.length === 1 ? 'it' : 'them'} untouched.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Perform the reset"
          description={`Acting as ${activeUser.name} — ${ROLE_LABEL[activeUser.role]}.`}
        />
        <CardBody>
          {!permission.allowed ? (
            <p role="note" className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              {permission.reason} Switch persona in the header to an Administrator to reset the demo. The
              workflow refuses this action for any other role even if the button were reachable.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">
                This cannot be undone from inside the demo. Take a moment before confirming.
              </p>
              {hydrated && persistence !== 'READY' ? (
                <p className="mt-3 text-xs text-muted">
                  Browser storage is not writable right now, so a reset would apply only to this session.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-medium text-danger"
              >
                Reset demo data…
              </button>
            </>
          )}

          {failure ? (
            <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {failure}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Reset the demo data?"
        description="Everything in this browser's copy of the demo goes back to the sample data."
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium"
            >
              Keep my data
            </button>
            <button
              type="button"
              onClick={confirmReset}
              disabled={working}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {working ? 'Resetting…' : 'Reset everything'}
            </button>
          </>
        }
      >
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <Badge tone="danger">Discarded</Badge>
            <span>
              {state.requests.length} requests, {state.allocations.length} allocations and{' '}
              {state.auditLog.length} audit entries currently in this browser.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Badge tone="success">Kept</Badge>
            <span>Backups of previously damaged data, which a reset never touches.</span>
          </li>
          <li className="flex items-start gap-2">
            <Badge tone="info">Added</Badge>
            <span>One audit entry recording that you performed this reset.</span>
          </li>
        </ul>

        {failure ? (
          <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {failure}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
