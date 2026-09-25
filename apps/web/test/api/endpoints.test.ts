import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCategoryTree, getItem, getSession, getTags, listItems } from "../../src/api/endpoints";
import { ApiError } from "../../src/api/errors";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const sampleItem = {
  id: "01HZY3Q3G0K8R4S8T2V6W0X4Y6",
  kind: "text",
  source: "web",
  categoryIds: [],
  tags: [],
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
  data: { body: "hello garden" },
};

describe("listItems", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("requests /api/items with filters and cursor and validates the paginated result", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ items: [sampleItem], nextCursor: "cursor-1" }));

    const result = await listItems({
      kind: ["text"],
      tag: ["ui"],
      cursor: "prev-cursor",
      limit: 10,
    });

    expect(result).toEqual({ items: [sampleItem], nextCursor: "cursor-1" });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/api/items");
    expect(url).toContain("kind=text");
    expect(url).toContain("tag=ui");
    expect(url).toContain("cursor=prev-cursor");
    expect(url).toContain("limit=10");
  });

  it("propagates a typed ApiError when the request fails", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "bad", message: "x" } }, 400));

    await expect(listItems()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("getItem", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("requests /api/items/:id and validates a single item", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(sampleItem));

    const result = await getItem(sampleItem.id);

    expect(result).toEqual(sampleItem);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain(`/api/items/${sampleItem.id}`);
  });
});

describe("getCategoryTree", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("requests /api/categories and validates the flat category list", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const category = {
      id: "01HZY3Q3G0K8R4S8T2V6W0X4Y7",
      name: "Color",
      slug: "color",
      parentId: null,
      position: 0,
    };
    fetchMock.mockResolvedValue(jsonResponse({ categories: [category] }));

    const result = await getCategoryTree();

    expect(result).toEqual({ categories: [category] });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/api/categories");
  });
});

describe("getTags", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("requests /api/tags and validates the tag list with counts", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const tag = { id: "01HZY3Q3G0K8R4S8T2V6W0X4Y8", name: "ui", count: 3 };
    fetchMock.mockResolvedValue(jsonResponse({ tags: [tag] }));

    const result = await getTags();

    expect(result).toEqual({ tags: [tag] });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/api/tags");
  });
});

describe("getSession", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("requests /api/session and validates the role", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ role: "owner" }));

    const result = await getSession();

    expect(result).toEqual({ role: "owner" });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/api/session");
  });

  it("rejects with a typed ApiError on an unexpected role value", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ role: "admin" }));

    await expect(getSession()).rejects.toBeInstanceOf(ApiError);
  });
});
