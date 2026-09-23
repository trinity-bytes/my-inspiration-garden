import { z } from "zod";
import { idSchema } from "./primitives";

export const categorySchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  /** `null` marks a root category; hierarchy has no depth limit. */
  parentId: idSchema.nullable(),
  position: z.number().int().nonnegative(),
});
export type Category = z.infer<typeof categorySchema>;

export const createCategoryInputSchema = categorySchema.omit({ id: true }).extend({
  slug: z.string().trim().min(1).optional(),
  parentId: idSchema.nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

export const updateCategoryInputSchema = createCategoryInputSchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;
