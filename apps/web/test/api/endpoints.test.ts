import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCategory,
  createItem,
  createToken,
  deleteCategory,
  deleteItem,
  getCategoryTree,
  getItem,
  getSession,
  getTags,
  importMedia,
  listItemRevisions,
  listItems,
  listTokens,
  restoreItem,
  restoreItemRevision,
  revokeToken,
  unfurlLink,
  updateCategory,
  updateItem,
  uploadMedia,
} from "../../src/api/endpoints";
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

describe("createCategory / updateCategory / deleteCategory (T11b B6 category manager)", () => {
  const originalFetch = globalThis.fetch;
  const category = {
    id: "01HZY3Q3G0K8R4S8T2V6W0X4YA",
    name: "Color",
    slug: "color",
    parentId: null,
    position: 0,
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("POSTs /api/categories and validates the created category", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(category, 201));

    const result = await createCategory({ name: "Color" });

    expect(result).toEqual(category);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/categories");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Color" });
  });

  it("PATCHes /api/categories/:id and validates the updated category", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ ...category, name: "Renamed" }));

    const result = await updateCategory(category.id, { name: "Renamed" });

    expect(result.name).toBe("Renamed");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/categories/${category.id}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Renamed" });
  });

  it("DELETEs /api/categories/:id with a 204 empty body and resolves to undefined", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteCategory(category.id)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/categories/${category.id}`);
    expect(init.method).toBe("DELETE");
  });

  it("propagates a typed ApiError when the delete request fails", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "category_cycle", message: "nope" } }, 422),
    );

    await expect(deleteCategory(category.id)).rejects.toBeInstanceOf(ApiError);
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

describe("listItems deletedOnly (T11 trash list)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("forwards deletedOnly as a query param", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ items: [], nextCursor: null }));

    await listItems({ deletedOnly: true });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("deletedOnly=true");
  });
});

describe("createItem (T11 quick-add)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("POSTs /api/items and validates the created item", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(sampleItem, 201));

    const result = await createItem({
      kind: "text",
      categoryIds: [],
      tags: [],
      data: { body: "hello garden" },
    });

    expect(result).toEqual(sampleItem);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/items");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ kind: "text" });
  });
});

describe("updateItem (T11 edit)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("PATCHes /api/items/:id and validates the updated item", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(sampleItem));

    const result = await updateItem(sampleItem.id, { kind: "text", title: "New title" });

    expect(result).toEqual(sampleItem);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/items/${sampleItem.id}`);
    expect(init.method).toBe("PATCH");
  });
});

describe("deleteItem / restoreItem (T11 trash)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("DELETEs /api/items/:id (soft delete)", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse({ ...sampleItem, deletedAt: "2026-09-26T00:00:00.000Z" }),
    );

    const result = await deleteItem(sampleItem.id);

    expect(result.deletedAt).toBe("2026-09-26T00:00:00.000Z");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/items/${sampleItem.id}`);
    expect(init.method).toBe("DELETE");
  });

  it("POSTs /api/items/:id/restore", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(sampleItem));

    const result = await restoreItem(sampleItem.id);

    expect(result).toEqual(sampleItem);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/items/${sampleItem.id}/restore`);
    expect(init.method).toBe("POST");
  });
});

describe("listItemRevisions / restoreItemRevision (T11 revision history)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("GETs /api/items/:id/revisions and validates the revision list", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const revision = {
      id: "01HZY3Q3G0K8R4S8T2V6W0X4Y9",
      itemId: sampleItem.id,
      snapshot: sampleItem,
      actor: "owner",
      createdAt: "2026-09-26T00:00:00.000Z",
    };
    fetchMock.mockResolvedValue(jsonResponse({ revisions: [revision] }));

    const result = await listItemRevisions(sampleItem.id);

    expect(result).toEqual({ revisions: [revision] });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain(`/api/items/${sampleItem.id}/revisions`);
  });

  it("POSTs /api/items/:id/revisions/:revisionId/restore", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(sampleItem));

    const result = await restoreItemRevision(sampleItem.id, "rev-1");

    expect(result).toEqual(sampleItem);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/items/${sampleItem.id}/revisions/rev-1/restore`);
    expect(init.method).toBe("POST");
  });
});

describe("unfurlLink (T11 quick-add link)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("POSTs /api/unfurl and validates the returned metadata", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const metadata = { url: "https://dribbble.com/shots/1", platform: "dribbble", title: "Shot" };
    fetchMock.mockResolvedValue(jsonResponse(metadata));

    const result = await unfurlLink("https://dribbble.com/shots/1");

    expect(result).toEqual(metadata);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/unfurl");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://dribbble.com/shots/1" });
  });
});

describe("uploadMedia / importMedia (T11 quick-add image)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("POSTs /api/media with a multipart file field and validates the stored-media result", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse({ r2Key: "media/2026/09/abc.png", mime: "image/png", size: 3 }, 201),
    );

    const file = new File(["abc"], "photo.png", { type: "image/png" });
    const result = await uploadMedia(file);

    expect(result).toEqual({ r2Key: "media/2026/09/abc.png", mime: "image/png", size: 3 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/media");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
  });

  it("POSTs /api/media/import with a remote url and validates the stored-media result", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse({ r2Key: "media/2026/09/def.jpg", mime: "image/jpeg", size: 9 }, 201),
    );

    const result = await importMedia("https://example.com/photo.jpg");

    expect(result).toEqual({ r2Key: "media/2026/09/def.jpg", mime: "image/jpeg", size: 9 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/media/import");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://example.com/photo.jpg" });
  });
});

describe("tokens (T12)", () => {
  const originalFetch = globalThis.fetch;
  const token = {
    id: "01HZY3Q3G0K8R4S8T2V6W0X4Y9",
    name: "agent-one",
    scope: "read" as const,
    createdAt: "2026-09-26T00:00:00.000Z",
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("requests /api/tokens and validates the token list, never a secret", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ tokens: [token] }));

    const result = await listTokens();

    expect(result).toEqual({ tokens: [token] });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/api/tokens");
  });

  it("POSTs /api/tokens and validates the created token (including the one-time secret)", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ ...token, token: "ig_plaintext" }, 201));

    const result = await createToken({ name: "agent-one", scope: "read" });

    expect(result).toEqual({ ...token, token: "ig_plaintext" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/tokens");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "agent-one", scope: "read" });
  });

  it("DELETEs /api/tokens/:id with a 204 empty body and resolves to undefined", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(revokeToken(token.id)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/tokens/${token.id}`);
    expect(init.method).toBe("DELETE");
  });
});
