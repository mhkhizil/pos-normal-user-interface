import { describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../api/HttpClient";
import { ApiPrintTemplateRepository } from "../ApiPrintTemplateRepository";

describe("ApiPrintTemplateRepository", () => {
  it("lists, creates, and resolves print templates", async () => {
    const template = {
      id: "template-1",
      tenantId: "tenant-1",
      type: "RECEIPT",
      name: "Default receipt",
      paperWidth: "MM80",
      isDefault: true,
      settings: { language: "FOLLOW_POS", copies: ["CUSTOMER"] },
    };
    const httpClient = {
      get: vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
          data: [template],
        })
        .mockResolvedValueOnce({
          data: { ...template, source: "LOCATION" },
        }),
      post: vi.fn().mockResolvedValue({ data: template }),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const repository = new ApiPrintTemplateRepository(
      httpClient as unknown as HttpClient
    );

    const listed = await repository.list({
      page: 1,
      limit: 10,
      type: "RECEIPT",
      locationId: "location-1",
    });
    expect(listed.templates[0]).toMatchObject({
      id: "template-1",
      name: "Default receipt",
      paperWidth: "MM80",
      settings: { language: "FOLLOW_POS", copies: ["CUSTOMER"] },
    });
    expect(httpClient.get).toHaveBeenCalledWith("/api/v1/print-templates", {
      params: {
        page: 1,
        limit: 10,
        type: "RECEIPT",
        locationId: "location-1",
      },
    });

    await repository.create({ type: "RECEIPT", name: "Default receipt" });
    expect(httpClient.post).toHaveBeenCalledWith("/api/v1/print-templates", {
      type: "RECEIPT",
      name: "Default receipt",
    });

    const resolved = await repository.resolve({
      type: "RECEIPT",
      locationId: "location-1",
    });
    expect(httpClient.get).toHaveBeenLastCalledWith("/api/v1/print-templates/resolve", {
      params: { type: "RECEIPT", locationId: "location-1" },
    });
    expect(resolved.source).toBe("LOCATION");
  });

  it("prints no footer for a kitchen ticket whose footer is null", async () => {
    const kitchen = (footerText: unknown) => ({
      id: "kitchen-1",
      type: "KITCHEN",
      name: "Kitchen",
      paperWidth: "MM80",
      settings: { other: { footerText } },
    });
    const httpClient = {
      get: vi.fn().mockResolvedValue({
        success: true,
        meta: { total: 3, page: 1, limit: 10, totalPages: 1 },
        data: [kitchen(null), kitchen("null"), kitchen("See you")],
      }),
    };
    const repository = new ApiPrintTemplateRepository(
      httpClient as unknown as HttpClient
    );

    const { templates } = await repository.list({ page: 1, limit: 10 });

    expect(templates.map((item) => item.settings.other.footerText)).toEqual([
      "",
      "",
      "See you",
    ]);
  });
});
