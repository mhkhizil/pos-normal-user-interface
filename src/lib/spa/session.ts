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

export const sessionMinutes = (room?: SpaRoom | null): number =>
  room?.minimumMinutes && room.minimumMinutes > 0 ? room.minimumMinutes : 60;

export const bookedSessions = (plannedMinutes: number | undefined, unit: number): number =>
  plannedMinutes && unit > 0 ? Math.round((plannedMinutes / unit) * 10) / 10 : 0;

export const spaSettleKey = (sessionId: string): string => `spa-settle-${sessionId}`;
