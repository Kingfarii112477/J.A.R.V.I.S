"use client";

import { useState } from "react";
import { useEventListener } from "@/hooks/useEventListener";
import { approvalManager, type ApprovalRequest } from "@/lib/autonomy/approvalManager";

/** Live view of the (at most one, in this UI) pending approval for a
 * mission — re-derived from ApprovalManager's own state on every
 * approval.requested/granted/denied event rather than duplicating it. */
export function useMissionPendingApproval(missionId: string): ApprovalRequest | null {
  const [pending, setPending] = useState<ApprovalRequest | null>(() => approvalManager.listPendingForMission(missionId)[0] ?? null);

  function refresh(eventMissionId: string) {
    if (eventMissionId !== missionId) return;
    setPending(approvalManager.listPendingForMission(missionId)[0] ?? null);
  }

  useEventListener("approval.requested", (p) => refresh(p.missionId));
  useEventListener("approval.granted", (p) => refresh(p.missionId));
  useEventListener("approval.denied", (p) => refresh(p.missionId));

  return pending;
}
