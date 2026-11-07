import type { Category, CreateCategoryInput, UpdateCategoryInput } from "@garden/shared";
import { slugify } from "@garden/shared";
import { eq, isNull } from "drizzle-orm";
import { AppError } from "../../lib/errors";
import type { Db } from "../client";
import { getCategoryDescendantIds } from "../queries";
import { categories } from "../schema";

/** Appends `-2`, `-3`, ... to `base` until the result isn't in `taken`. */
function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

function rowToCategory(row: typeof categories.$inferSelect): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parentId,
    position: row.position,
  };
}

export class CategoriesRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<Category[]> {
    const rows = await this.db.select().from(categories);
    return rows.map(rowToCategory);
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    if (input.parentId) {
      const parent = await this.db
        .select()
        .from(categories)
        .where(eq(categories.id, input.parentId))
        .limit(1);
      if (parent.length === 0)
        throw AppError.badRequest("parent_not_found", "parentId does not exist");
    }
    const id = crypto.randomUUID();
    const slug = input.slug ?? slugify(input.name);
    const row = {
      id,
      name: input.name,
      slug,
      parentId: input.parentId ?? null,
      position: input.position ?? 0,
    };

    try {
      await this.db.insert(categories).values(row);
    } catch (error) {
      throw AppError.conflict(
        "category_slug_conflict",
        "a sibling category with this slug already exists",
        {
          cause: String(error),
        },
      );
    }
    return rowToCategory(row as typeof categories.$inferSelect);
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const existingRows = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) throw AppError.notFound("category not found");

    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === id) {
        throw AppError.unprocessable("category_cycle", "a category cannot be its own parent");
      }
      const parentRows = await this.db
        .select()
        .from(categories)
        .where(eq(categories.id, input.parentId))
        .limit(1);
      if (parentRows.length === 0)
        throw AppError.badRequest("parent_not_found", "parentId does not exist");
      const descendants = await getCategoryDescendantIds(this.db, [id]);
      if (descendants.includes(input.parentId)) {
        throw AppError.unprocessable(
          "category_cycle",
          "a category cannot be moved under its own descendant",
        );
      }
    }

    const row = {
      name: input.name ?? existing.name,
      slug: input.slug ?? existing.slug,
      parentId: input.parentId !== undefined ? input.parentId : existing.parentId,
      position: input.position ?? existing.position,
    };

    try {
      await this.db.update(categories).set(row).where(eq(categories.id, id));
    } catch (error) {
      throw AppError.conflict(
        "category_slug_conflict",
        "a sibling category with this slug already exists",
        {
          cause: String(error),
        },
      );
    }

    return rowToCategory({ id, ...row } as typeof categories.$inferSelect);
  }

  /**
   * Deletes a category. Direct children are re-parented to the deleted
   * category's own parent (its `parentId`, possibly `null` when the deleted
   * category was itself top-level) rather than promoted all the way to root
   * — removing a middle node in the tree shouldn't flatten its whole
   * subtree. Items only lose the `item_categories`
   * link to the deleted category, via the table's `ON DELETE CASCADE`;
   * nothing else about them changes.
   *
   * A moved child keeps a unique slug under its new parent: on a
   * `(parentId, slug)` collision with a sibling already there, `-2`, `-3`,
   * ... is appended until it's unique, rather than failing the whole delete
   * over an incidental naming clash.
   */
  async delete(id: string): Promise<void> {
    const existingRows = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) throw AppError.notFound("category not found");

    const children = await this.db.select().from(categories).where(eq(categories.parentId, id));

    const statements: unknown[] = [];
    if (children.length > 0) {
      const newParentId = existing.parentId;
      const siblingRows = await this.db
        .select({ slug: categories.slug })
        .from(categories)
        .where(
          newParentId === null ? isNull(categories.parentId) : eq(categories.parentId, newParentId),
        );
      const takenSlugs = new Set(siblingRows.map((row) => row.slug));

      for (const child of [...children].sort((a, b) => a.position - b.position)) {
        const slug = uniqueSlug(child.slug, takenSlugs);
        takenSlugs.add(slug);
        statements.push(
          this.db
            .update(categories)
            .set({ parentId: newParentId, slug })
            .where(eq(categories.id, child.id)),
        );
      }
    }
    statements.push(this.db.delete(categories).where(eq(categories.id, id)));

    await this.db.batch(statements as unknown as Parameters<Db["batch"]>[0]);
  }
}
