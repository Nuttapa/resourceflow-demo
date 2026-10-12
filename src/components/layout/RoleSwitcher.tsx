'use client';

import { useId } from 'react';
import { useDemoState } from '@/state/DemoStateProvider';
import { ROLE_LABEL, ROLES, type Role } from '@/lib/types';
import { Badge, type BadgeTone } from '@/components/ui/Badge';

const ROLE_TONE: Record<Role, BadgeTone> = {
  REQUESTER: 'info',
  APPROVER: 'accent',
  ADMIN: 'warning',
};

/**
 * Simulated session switcher. This is explicitly NOT authentication: there is no
 * password, no token, no identity provider and no server. Picking a persona only
 * changes which fictional user the workflow rules are evaluated against.
 */
export function RoleSwitcher({ className = '' }: { className?: string }) {
  const { state, activeUser, setActiveUser, hydrated } = useDemoState();
  const selectId = useId();

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={selectId} className="text-xs font-medium text-muted">
        Simulated demo session &mdash; acting as
      </label>

      <div className="flex items-center gap-2">
        <select
          id={selectId}
          value={activeUser.id}
          disabled={!hydrated}
          onChange={(event) => setActiveUser(event.target.value)}
          className="w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm
                     disabled:opacity-60 sm:w-64"
        >
          {ROLES.map((role) => {
            const usersInRole = state.users.filter((u) => u.role === role);
            if (usersInRole.length === 0) return null;
            return (
              <optgroup key={role} label={ROLE_LABEL[role]}>
                {usersInRole.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} &mdash; {user.department}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>

        <Badge tone={ROLE_TONE[activeUser.role]}>{ROLE_LABEL[activeUser.role]}</Badge>
      </div>

      <p className="text-xs text-muted">
        No password, token or identity provider is involved. Permission checks run in the browser only
        and are not production security.
      </p>
    </div>
  );
}
