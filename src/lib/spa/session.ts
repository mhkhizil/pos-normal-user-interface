import { SpaRoom, SpaSession } from "@/core/domain/entities/Spa";

export const isOpenSpaSession = (session?: SpaSession | null): boolean =>
  Boolean(session && session.sessionState !== "CLOSED" && !session.closedAt);

export const findActiveSpaSession = (
  room?: SpaRoom | null
): SpaSession | undefined =>
  [...(room?.sessions || [])]
    .filter(isOpenSpaSession)
    .sort(
      (left, right) =>
        new Date(right.openedAt || 0).getTime() -
        new Date(left.openedAt || 0).getTime()
    )[0];

export const treatmentLengthOptions = (room?: SpaRoom | null): number[] => {
  const unit = room?.minimumMinutes && room.minimumMinutes > 0 ? room.minimumMinutes : 60;
  return [unit, unit * 2, unit * 3];
};

export const spaSettleKey = (sessionId: string): string => `spa-settle-${sessionId}`;
