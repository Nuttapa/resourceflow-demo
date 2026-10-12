'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { applyAction, type WorkflowAction } from '@/lib/dispatch';
import { createEnv, type WorkflowEnv } from '@/lib/ids';
import { describeOutcome } from '@/lib/notify';
import { createSeedState } from '@/lib/seed';
import {
  loadState,
  writeState,
  type LoadSource,
  type PersistenceStatus,
} from '@/lib/storage';
import type { DemoState, DemoUser } from '@/lib/types';
import type { WorkflowResult } from '@/lib/workflow';
import { useToast } from '@/components/ui/Toast';

export interface DispatchOutcome {
  /** Whether the workflow allowed the action. */
  ok: boolean;
  /** Present when the action was refused. */
  code?: string;
  reason?: string;
  /**
   * Whether the resulting state reached browser storage. False means the change
   * (or, for a refused action, its audit entry) exists only in this session.
   */
  persisted: boolean;
  result: WorkflowResult;
}

interface DemoStateValue {
  /** False until stored state has been read; screens show skeletons meanwhile. */
  hydrated: boolean;
  state: DemoState;
  activeUser: DemoUser;
  persistence: PersistenceStatus;
  source: LoadSource;
  notice: string | null;
  dismissNotice: () => void;
  setActiveUser: (userId: string) => void;
  /**
   * The ONLY way to change demo data. Every action goes through the workflow
   * rules in `lib/workflow.ts`; screens never edit requests, allocations or
   * pools themselves.
   */
  dispatch: (action: WorkflowAction) => DispatchOutcome;
}

const DemoStateContext = createContext<DemoStateValue | null>(null);

function resolveActiveUser(state: DemoState): DemoUser {
  const found = state.users.find((u) => u.id === state.activeUserId);
  // validateState guarantees a match; this keeps the type honest without `!`.
  return found ?? state.users[0] ?? createSeedState().users[0]!;
}

export function DemoStateProvider({ children }: { children: ReactNode }) {
  // The server render and the first client render both use the deterministic
  // seed, so markup matches; stored data is applied in the effect below.
  const [state, setState] = useState<DemoState>(() => createSeedState());
  const [hydrated, setHydrated] = useState(false);
  const [persistence, setPersistence] = useState<PersistenceStatus>('UNAVAILABLE');
  const [source, setSource] = useState<LoadSource>('SEED');
  const [notice, setNotice] = useState<string | null>(null);
  const { push } = useToast();

  /**
   * Refs mirror the latest values so a dispatch always reads current data.
   * Without this, two clicks in the same React batch would both start from the
   * pre-click state and the second would silently overwrite the first.
   */
  const stateRef = useRef(state);
  const persistenceRef = useRef(persistence);
  const envRef = useRef<WorkflowEnv | null>(null);
  if (envRef.current === null) envRef.current = createEnv();

  const commit = useCallback((next: DemoState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const setPersistenceSafely = useCallback((next: PersistenceStatus) => {
    persistenceRef.current = next;
    setPersistence(next);
  }, []);

  useEffect(() => {
    const result = loadState();
    stateRef.current = result.state;
    persistenceRef.current = result.persistence;
    setState(result.state);
    setPersistence(result.persistence);
    setSource(result.source);
    setNotice(result.notice ?? null);
    setHydrated(true);
  }, []);

  const setActiveUser = useCallback(
    (userId: string) => {
      const current = stateRef.current;
      if (!current.users.some((u) => u.id === userId)) return;
      const next = { ...current, activeUserId: userId };
      commit(next);
      // Switching persona is a demo convenience, not a workflow action: it is
      // not audited, and a failed write only costs the remembered selection.
      if (persistenceRef.current === 'READY' && !writeState(next)) {
        setPersistenceSafely('READ_ONLY');
      }
    },
    [commit, setPersistenceSafely],
  );

  const dispatch = useCallback(
    (action: WorkflowAction): DispatchOutcome => {
      const current = stateRef.current;
      const actor = resolveActiveUser(current);
      const env = envRef.current!;

      // 1. Business rules decide. A refusal still returns a state: the original
      //    data plus one DENIED audit entry.
      const result = applyAction(current, actor, action, env);

      // 2. Try to persist, then report what actually happened. We never claim a
      //    save we did not observe succeeding.
      let persisted = false;
      if (persistenceRef.current === 'READY') {
        persisted = writeState(result.state);
        if (!persisted) setPersistenceSafely('READ_ONLY');
      }

      // 3. Adopt the new state either way, so the audit entry is not lost.
      commit(result.state);

      push(describeOutcome(result, persisted, persistenceRef.current));

      const outcome: DispatchOutcome = { ok: result.ok, persisted, result };
      return result.ok ? outcome : { ...outcome, code: result.code, reason: result.reason };
    },
    [commit, push, setPersistenceSafely],
  );

  const value = useMemo<DemoStateValue>(
    () => ({
      hydrated,
      state,
      activeUser: resolveActiveUser(state),
      persistence,
      source,
      notice,
      dismissNotice: () => setNotice(null),
      setActiveUser,
      dispatch,
    }),
    [hydrated, state, persistence, source, notice, setActiveUser, dispatch],
  );

  return <DemoStateContext.Provider value={value}>{children}</DemoStateContext.Provider>;
}

export function useDemoState(): DemoStateValue {
  const ctx = useContext(DemoStateContext);
  if (!ctx) throw new Error('useDemoState must be used inside <DemoStateProvider>.');
  return ctx;
}
