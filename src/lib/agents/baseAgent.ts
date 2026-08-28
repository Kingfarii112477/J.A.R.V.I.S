import type { PermissionLevel } from "@/types/tools";

/** Ordering for permission-ceiling checks — SAFE is least privileged,
 * ADMIN most. Shared by AgentRegistry.canExecute and the orchestrator's
 * tool-scoping so "agent max permission" comparisons stay consistent
 * with the existing PermissionLevel semantics from Phase 2. */
export const PERMISSION_RANK: Record<PermissionLevel, number> = {
  SAFE: 0,
  CONFIRM: 1,
  RESTRICTED: 2,
  ADMIN: 3,
};

export function permissionWithinCeiling(permission: PermissionLevel, ceiling: PermissionLevel): boolean {
  return PERMISSION_RANK[permission] <= PERMISSION_RANK[ceiling];
}
