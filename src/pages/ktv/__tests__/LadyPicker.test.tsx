import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Hostess } from "@/core/domain/entities/Hostess";
import { LadyPicker } from "../LadyPicker";
import { LineEditDialog } from "../../cashier/LineEditDialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const working = vi.hoisted(() => ({
  state: { hostesses: [] as unknown[], isLoading: false, error: null, loadedAt: null as number | null },
  load: vi.fn(),
}));
vi.mock("@/core/presentation/hooks/useWorkingHostesses", () => ({
  useWorkingHostesses: () => ({ ...working.state, load: working.load }),
}));

const lady = (id: string, name: string, room?: string, nickname: string | null = null): Hostess => ({
  id,
  name,
  nickname,
  inRoom: room ? { roomNumber: room, until: null } : null,
});

const ladies = [
  lady("mya", "Mya", "3"),
  lady("hnin", "Hnin"),
  lady("thiri", "Thiri", "7"),
  lady("su", "Su Su Hlaing", undefined, "Su Su"),
];

describe("LadyPicker", () => {
  beforeEach(() => {
    working.state = { hostesses: [], isLoading: false, error: null, loadedAt: null };
    working.load.mockClear();
  });

  it("reloads the ladies on opening and files each where she is now", () => {
    working.state = {
      hostesses: [lady("hnin", "Hnin", "3"), lady("mya", "Mya", "3")],
      isLoading: false,
      error: null,
      loadedAt: 1,
    };
    render(
      <LadyPicker itemName="Tiger Beer" ladies={ladies} roomNumber="3" onPick={vi.fn()} onCancel={vi.fn()} />
    );

    expect(working.load).toHaveBeenCalled();
    const here = screen.getByText("spa.ladiesInThisRoom").closest("section")!;
    expect(within(here).getAllByRole("button").map((button) => button.textContent)).toEqual(["Hnin", "Mya"]);
    expect(screen.queryByText("spa.ladiesFree")).toBeNull();
  });

  it("lists this room's ladies first, then free ones, then the ones in other rooms", () => {
    render(
      <LadyPicker itemName="Tiger Beer" ladies={ladies} roomNumber="3" onPick={vi.fn()} onCancel={vi.fn()} />
    );

    const sections = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(sections).toEqual(["spa.ladiesInThisRoom", "spa.ladiesFree", "spa.ladiesInOtherRooms"]);
    const free = screen.getByText("spa.ladiesFree").closest("section")!;
    expect(within(free).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Hnin",
      "Su Su",
    ]);
  });

  it("finds a lady by name or nickname", async () => {
    const onPick = vi.fn();
    render(
      <LadyPicker itemName="Tiger Beer" ladies={ladies} roomNumber="3" onPick={onPick} onCancel={vi.fn()} />
    );

    await userEvent.type(screen.getByRole("searchbox"), "hlaing");

    expect(screen.queryByText("Mya")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Su Su" }));
    expect(onPick).toHaveBeenCalledWith(ladies[3]);
  });
});

describe("LineEditDialog with all ladies", () => {
  it("names a lady who is not with the room as the one who ordered", async () => {
    const onSave = vi.fn();
    render(
      <LineEditDialog
        name="Tiger Beer"
        quantity={1}
        unitPrice={6000}
        isFoc={false}
        orderers={[]}
        allLadies={ladies}
        roomNumber="3"
        onSave={onSave}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "ktvPos.allLadies" }));
    await userEvent.click(screen.getByRole("button", { name: /Thiri/ }));

    expect(screen.getByRole("button", { name: "Thiri" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "cashier.lineEdit.save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ orderedBy: "thiri" }));
  });
});
