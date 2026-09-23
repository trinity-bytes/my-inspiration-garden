import type { Category, CreateCategoryInput, UpdateCategoryInput } from "@garden/shared";
import { slugify } from "@garden/shared";
import { eq } from "drizzle-orm";
import { AppError } from "../../lib/errors";
import type { Db } from "../client";
import { getCategoryDescendantIds } from "../queries";
import { categories } from "../schema";

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

  async delete(id: string): Promise<void> {
    const existingRows = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    if (existingRows.length === 0) throw AppError.notFound("category not found");
    await this.db.delete(categories).where(eq(categories.id, id));
  }
}
