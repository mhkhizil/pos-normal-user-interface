import { beforeEach, describe, expect, it, vi } from "vitest";
import { QzTrayClient } from "../QzTrayClient";

const mocks = vi.hoisted(() => ({
  active: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  print: vi.fn(),
}));

vi.mock("qz-tray", () => ({
  default: {
    websocket: {
      isActive: () => mocks.active,
      connect: mocks.connect,
      disconnect: mocks.disconnect,
    },
    printers: { find: mocks.find },
    configs: { create: mocks.create },
    print: mocks.print,
  },
}));

describe("QzTrayClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.active = false;
    mocks.connect.mockResolvedValue(undefined);
    mocks.find.mockResolvedValue(["Kitchen USB"]);
    mocks.create.mockReturnValue({ printer: "test" });
    mocks.print.mockResolvedValue(undefined);
  });

  it("keeps a blocked-site error instead of saying QZ Tray is stopped", async () => {
    mocks.connect.mockRejectedValue(new Error("Connection blocked by user"));
    const client = new QzTrayClient();

    await expect(client.connect()).rejects.toThrow(/Click Allow/);
  });

  it("discovers installed printer queues", async () => {
    const client = new QzTrayClient();

    await expect(client.findPrinters()).resolves.toEqual(["Kitchen USB"]);
    expect(mocks.connect).toHaveBeenCalled();
  });

  it("sends a raw ESC/POS network test print", async () => {
    const client = new QzTrayClient();

    await client.testPrint({
      id: "network-1",
      transport: "NETWORK",
      displayName: "Hot Line",
      host: "192.168.1.50",
      port: 9100,
      lastVerifiedAt: "",
    });

    expect(mocks.create).toHaveBeenCalledWith({
      host: "192.168.1.50",
      port: 9100,
    });
    expect(mocks.print).toHaveBeenCalledWith(
      { printer: "test" },
      [expect.objectContaining({ type: "raw", format: "command" })]
    );
  });
});
