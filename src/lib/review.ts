import { z } from "zod";
import { billFieldsSchema, type BillFields } from "./bills";

const fieldIssueSchema = z.enum([
  "missing",
  "absent",
  "ambiguous",
  "unreadable",
  "rejected",
]);
export type FieldIssue = z.infer<typeof fieldIssueSchema>;
export type FieldIssues = Partial<Record<keyof BillFields, FieldIssue>>;

export function readFieldIssues(value: unknown): FieldIssues {
  const input = z.record(z.unknown()).safeParse(value);
  if (!input.success) return {};
  const issues: FieldIssues = {};
  for (const [field, issue] of Object.entries(input.data)) {
    const parsed = fieldIssueSchema.safeParse(issue);
    if (Object.hasOwn(billFieldsSchema.shape, field) && parsed.success)
      issues[field as keyof BillFields] = parsed.data;
  }
  return issues;
}

export const draftPatchSchema = billFieldsSchema.partial().strict();
export type DraftPatch = z.infer<typeof draftPatchSchema>;
export const autosaveSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  patch: draftPatchSchema,
});
export type FieldEvidence = Record<
  string,
  { quote: string; page: number | null }
>;

export function evidenceWithPages(
  evidence: unknown,
  pages: { pageIndex: number; text: string | null }[],
): FieldEvidence {
  const parsed = z.record(z.string()).safeParse(evidence);
  if (!parsed.success) return {};
  const normalize = (value: string) =>
    value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  return Object.fromEntries(
    Object.entries(parsed.data).map(([field, quote]) => [
      field,
      {
        quote,
        page:
          pages.find((page) =>
            normalize(page.text ?? "").includes(normalize(quote)),
          )?.pageIndex ?? null,
      },
    ]),
  );
}
