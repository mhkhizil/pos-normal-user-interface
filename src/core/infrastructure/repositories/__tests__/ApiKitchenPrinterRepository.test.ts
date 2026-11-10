import { describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../api/HttpClient";
import { ApiKitchenPrinterRepository } from "../ApiKitchenPrinterRepository";

describe("ApiKitchenPrinterRepository", () => {
  it("maps paginated printers and CRUD endpoints on /api/v1/printers", async () => {
    const item = {
      id: "printer-1",
      tenantId: "tenant-1",
      locationId: "location-1",
      name: "Hot Line",
      ipAddress: "192.168.1.50",
      port: 9100,
      sectors: ["KDS", "CHECKOUT"],
      printsFor: ["KTV"],
      isActive: true,
    };
    const get = vi.fn().mockResolvedValue({
      data: [item],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    });
    const post = vi.fn().mockResolvedValue({ data: item });
    const patch = vi.fn().mockResolvedValue({ data: item });
    const remove = vi.fn().mockResolvedValue({ data: item });
    const repository = new ApiKitchenPrinterRepository({
      get,
      post,
      patch,
      delete: remove,
    } as unknown as HttpClient);

    const list = await repository.list({
      page: 1,
      limit: 10,
      locationId: "location-1",
      sector: "KDS",
      area: "KTV",
    });
    await repository.create({
      tenantId: "tenant-1",
      locationId: "location-1",
      name: "Hot Line",
      ipAddress: "192.168.1.50",
      port: 9100,
      sectors: ["KDS", "CHECKOUT"],
      isActive: true,
    });
    await repository.update("printer-1", { isActive: false, sectors: ["FINANCE"] });
    await repository.delete("printer-1");

    expect(list.printers[0]).toMatchObject(item);
    expect(get).toHaveBeenCalledWith("/api/v1/printers", {
      params: {
        page: 1,
        limit: 10,
        locationId: "location-1",
        sector: "KDS",
        area: "KTV",
      },
    });
    expect(post).toHaveBeenCalledWith("/api/v1/printers", {
      tenantId: "tenant-1",
      locationId: "location-1",
      name: "Hot Line",
      ipAddress: "192.168.1.50",
      port: 9100,
      sectors: ["KDS", "CHECKOUT"],
      isActive: true,
    });
    expect(patch).toHaveBeenCalledWith("/api/v1/printers/printer-1", {
      isActive: false,
      sectors: ["FINANCE"],
    });
    expect(remove).toHaveBeenCalledWith("/api/v1/printers/printer-1");
  });

  it("attaches and detaches categories on /api/v1/printers", async () => {
    const post = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const repository = new ApiKitchenPrinterRepository({
      post,
      delete: remove,
    } as unknown as HttpClient);

    await repository.attachCategory("printer-1", "category-1");
    await repository.detachCategory("printer-1", "category-1");

    expect(post).toHaveBeenCalledWith("/api/v1/printers/printer-1/categories", {
      categoryId: "category-1",
    });
    expect(remove).toHaveBeenCalledWith(
      "/api/v1/printers/printer-1/categories/category-1"
    );
  });
});
