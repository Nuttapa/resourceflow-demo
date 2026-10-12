import type { WorkflowEnv } from './ids';
import type { DemoState, DemoUser } from './types';
import type { RequestDraft } from './validation';
import {
  allocateRequest,
  cancelRequest,
  createRequest,
  decideRequest,
  expireAllocation,
  resetDemoData,
  returnAllocation,
  type Decision,
  type WorkflowResult,
} from './workflow';

/**
 * Every change the UI is allowed to ask for. Screens build one of these and
 * hand it to the provider; they never touch requests, allocations or pools.
 */
export type WorkflowAction =
  | { type: 'request:create'; draft: RequestDraft }
  | { type: 'request:decide'; requestId: string; decision: Decision; note?: string }
  | { type: 'request:cancel'; requestId: string; reason?: string }
  | { type: 'allocation:create'; requestId: string }
  | { type: 'allocation:return'; allocationId: string; reason?: string }
  | { type: 'allocation:expire'; allocationId: string; reason: string }
  | { type: 'demo:reset' };

/**
 * The one place an action becomes a workflow call. Pure and synchronous, so it
 * can be tested without React and cannot be bypassed from a screen.
 */
export function applyAction(
  state: DemoState,
  actor: DemoUser,
  action: WorkflowAction,
  env: WorkflowEnv,
): WorkflowResult {
  switch (action.type) {
    case 'request:create':
      return createRequest(state, actor, action.draft, env);
    case 'request:decide':
      return decideRequest(state, actor, action.requestId, action.decision, action.note, env);
    case 'request:cancel':
      return cancelRequest(state, actor, action.requestId, action.reason, env);
    case 'allocation:create':
      return allocateRequest(state, actor, action.requestId, env);
    case 'allocation:return':
      return returnAllocation(state, actor, action.allocationId, env, action.reason);
    case 'allocation:expire':
      return expireAllocation(state, actor, action.allocationId, action.reason, env);
    case 'demo:reset':
      return resetDemoData(state, actor, env);
    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled workflow action: ${JSON.stringify(exhaustive)}`);
    }
  }
}
