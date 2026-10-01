import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/index.server";
import { items } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/auth.server";

const newItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  brand: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  purchaseDate: z.string().date().optional(),
  warrantyExpiresAt: z.string().date().optional(),
  serialNumber: z.string().trim().max(160).optional(),
  purchasePrice: z.number().finite().nonnegative().optional(),
  currency: z.string().length(3).default("INR"),
  notes: z.string().trim().max(4000).optional(),
});

export const listItems = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await getAuthenticatedUserId();
  return getDatabase()
    .select()
    .from(items)
    .where(eq(items.userId, userId))
    .orderBy(desc(items.createdAt));
});

export const createItem = createServerFn({ method: "POST" })
  .inputValidator(newItemSchema)
  .handler(async ({ data }) => {
    const userId = await getAuthenticatedUserId();
    const [item] = await getDatabase()
      .insert(items)
      .values({
        ...data,
        userId,
        brand: data.brand || null,
        category: data.category || null,
        purchaseDate: data.purchaseDate || null,
        warrantyExpiresAt: data.warrantyExpiresAt || null,
        serialNumber: data.serialNumber || null,
        purchasePrice: data.purchasePrice?.toFixed(2) ?? null,
        notes: data.notes || null,
      })
      .returning();

    return item;
  });
