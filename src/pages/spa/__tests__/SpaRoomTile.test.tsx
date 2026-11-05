import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpaRoom, SpaSession } from "@/core/domain/entities/Spa";
import { SpaRoomTile } from "../SpaRoomTile";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { exists: () => false } }),
}));

const tile = (room: SpaRoom, onReady = vi.fn()) => {
  render(
    <SpaRoomTile
      kind="ktv"
      room={room}
      nowMs={Date.now()}
      onSelect={vi.fn()}
      onReady={onReady}
      onManage={vi.fn()}
    />
  );
  return onReady;
};

describe("SpaRoomTile", () => {
  it("lets a room shown in use with nobody in it be marked ready", () => {
    const onReady = tile(new SpaRoom({ id: "r1", roomNumber: "101", status: "OCCUPIED", sessions: [] }));

    fireEvent.click(screen.getByRole("button", { name: "spa.markReady" }));

    expect(onReady).toHaveBeenCalled();
  });

  it("does not offer it while a party is in the room", () => {
    tile(
      new SpaRoom({
        id: "r1",
        roomNumber: "106",
        status: "OCCUPIED",
        sessions: [
          new SpaSession({
            id: "s1",
            roomId: "r1",
            sessionState: "OPEN",
            openedAt: new Date().toISOString(),
            guestCount: 1,
            plannedMinutes: 60,
          }),
        ],
      })
    );

    expect(screen.queryByRole("button", { name: "spa.markReady" })).toBeNull();
  });
});
