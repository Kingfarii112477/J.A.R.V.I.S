/**
 * LEVEL 0 Manual        — J.A.R.V.I.S only responds, no missions.
 * LEVEL 1 Assisted      — J.A.R.V.I.S proposes actions; user approves each one.
 * LEVEL 2 Supervised    — SAFE actions auto-execute; CONFIRM actions need approval. (default)
 * LEVEL 3 Delegated     — user approves the whole plan up front; SAFE auto-executes,
 *                          CONFIRM follows the configured approval policy.
 * LEVEL 4 Controlled Autonomous — approved *classes* of actions may run unattended.
 *                          RESTRICTED/ADMIN tools stay inaccessible regardless of level.
 */
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;

export const AUTONOMY_LEVELS: AutonomyLevel[] = [0, 1, 2, 3, 4];

export const AUTONOMY_LEVEL_LABELS: Record<AutonomyLevel, string> = {
  0: "MANUAL",
  1: "ASSISTED",
  2: "SUPERVISED",
  3: "DELEGATED",
  4: "CONTROLLED AUTONOMOUS",
};

export const AUTONOMY_LEVEL_DESCRIPTIONS: Record<AutonomyLevel, string> = {
  0: "J.A.R.V.I.S only responds — no autonomous missions.",
  1: "J.A.R.V.I.S proposes actions; every action requires individual approval.",
  2: "SAFE actions execute automatically; CONFIRM actions require approval.",
  3: "The user approves a full plan up front; SAFE actions then run unattended.",
  4: "Approved classes of actions may run unattended. RESTRICTED/ADMIN remain locked.",
};

/** Never silently increase autonomy — this is the one place a session's
 * effective level is allowed to start from. */
export const DEFAULT_AUTONOMY_LEVEL: AutonomyLevel = 2;
