import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, LoaderCircle, Save } from "lucide-react";
import {
  saveBillSchema,
  categories,
  deadlineFromDuration,
  type BillFields,
} from "@/lib/bills";
import type { DraftPatch, FieldEvidence } from "@/lib/review";

export function BillForm({
  initial,
  onSave,
  saving,
  error,
  disabled = false,
  onChange,
  evidence = {},
  draftPatch = {},
  warnMissingName = false,
  missingNameMessage = "Item name not found in the extracted details.",
}: {
  initial: BillFields;
  onSave: (fields: BillFields) => void;
  saving: boolean;
  error: string | null;
  disabled?: boolean;
  onChange?: (patch: DraftPatch) => void;
  evidence?: FieldEvidence;
  draftPatch?: DraftPatch;
  warnMissingName?: boolean;
  missingNameMessage?: string;
}) {
  const [fields, setFields] = useState(initial);
  const [validation, setValidation] = useState<string | null>(null);
  const edited = useRef(new Set(Object.keys(draftPatch)));
  useEffect(
    () =>
      setFields(
        (current) =>
          Object.fromEntries(
            Object.entries(initial).map(([key, value]) => [
              key,
              edited.current.has(key)
                ? current[key as keyof BillFields]
                : value,
            ]),
          ) as BillFields,
      ),
    [initial],
  );
  const update = <K extends keyof BillFields>(key: K, value: BillFields[K]) => {
    const current = fields;
    const next = { ...current, [key]: value };
    if (key === "purchaseDate" || key === "warrantyMonths") {
      const oldCalculated = deadlineFromDuration(
        current.purchaseDate,
        current.warrantyMonths,
        "months",
      );
      if (
        key === "warrantyMonths" ||
        !current.warrantyExpiresAt ||
        current.warrantyExpiresAt === oldCalculated
      )
        next.warrantyExpiresAt = deadlineFromDuration(
          next.purchaseDate,
          next.warrantyMonths,
          "months",
        );
    }
    if (key === "purchaseDate" || key === "returnWindowDays") {
      const oldCalculated = deadlineFromDuration(
        current.purchaseDate,
        current.returnWindowDays,
        "days",
      );
      if (
        key === "returnWindowDays" ||
        !current.returnExpiresAt ||
        current.returnExpiresAt === oldCalculated
      )
        next.returnExpiresAt = deadlineFromDuration(
          next.purchaseDate,
          next.returnWindowDays,
          "days",
        );
    }
    const patch = Object.fromEntries(
      Object.entries(next).filter(
        ([field, value]) =>
          JSON.stringify(value) !==
          JSON.stringify(current[field as keyof BillFields]),
      ),
    ) as DraftPatch;
    Object.keys(patch).forEach((field) => edited.current.add(field));
    setFields(next);
    onChange?.(patch);
  };
  const provenance = (key: keyof BillFields) => {
    const source = evidence[key];
    const calculated =
      (key === "warrantyExpiresAt" &&
        fields.warrantyExpiresAt &&
        fields.warrantyMonths !== null &&
        fields.warrantyExpiresAt ===
          deadlineFromDuration(
            fields.purchaseDate,
            fields.warrantyMonths,
            "months",
          )) ||
      (key === "returnExpiresAt" &&
        fields.returnExpiresAt &&
        fields.returnWindowDays !== null &&
        fields.returnExpiresAt ===
          deadlineFromDuration(
            fields.purchaseDate,
            fields.returnWindowDays,
            "days",
          ));
    if (calculated && (!source || edited.current.has(key)))
      return (
        <p className="mt-1 text-[11px] font-normal text-muted-foreground">
          Calculated from purchase date and duration
        </p>
      );
    if (edited.current.has(key))
      return (
        <p className="mt-1 text-[11px] font-normal text-muted-foreground">
          Your correction
        </p>
      );
    if (source)
      return (
        <details className="mt-1 text-[11px] font-normal text-muted-foreground">
          <summary className="cursor-pointer">
            From original
            {source.page !== null ? ` · Page ${source.page + 1}` : ""}
          </summary>
          <p className="mt-1 whitespace-pre-wrap break-words border-l-2 border-primary pl-2">
            {source.quote}
          </p>
        </details>
      );
    if (key === "currency")
      return (
        <p className="mt-1 text-[11px] font-normal text-muted-foreground">
          Default currency
        </p>
      );
    return null;
  };
  const inputClass =
    "mt-1.5 block min-h-11 w-full min-w-0 rounded-sm border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary";
  const textField = (
    key:
      | "name"
      | "retailer"
      | "brand"
      | "invoiceNumber"
      | "serialNumber"
      | "modelNumber"
      | "barcode",
    label: string,
    max = 160,
  ) => (
    <div className="min-w-0 text-xs font-semibold" key={key}>
      <label htmlFor={`bill-${key}`}>{label}</label>
      <input
        id={`bill-${key}`}
        name={key}
        value={fields[key] ?? ""}
        onChange={(event) =>
          update(
            key,
            key === "name" ? event.target.value : event.target.value || null,
          )
        }
        maxLength={max}
        required={key === "name"}
        aria-describedby={
          key === "name" && warnMissingName && !fields.name
            ? "bill-name-missing"
            : undefined
        }
        className={`${inputClass} ${key === "name" && warnMissingName && !fields.name ? "border-accent" : ""}`}
      />
      {key === "name" && warnMissingName && !fields.name ? (
        <p
          id="bill-name-missing"
          className="mt-1 text-xs font-normal text-muted-foreground"
        >
          {missingNameMessage}
        </p>
      ) : null}
      {provenance(key)}
    </div>
  );
  const dateField = (
    key: "purchaseDate" | "warrantyExpiresAt" | "returnExpiresAt",
    label: string,
  ) => (
    <div className="min-w-0 text-xs font-semibold">
      <label htmlFor={`bill-${key}`}>{label}</label>
      <input
        id={`bill-${key}`}
        type="date"
        value={fields[key] ?? ""}
        onChange={(event) => update(key, event.target.value || null)}
        min={
          key !== "purchaseDate"
            ? (fields.purchaseDate ?? undefined)
            : undefined
        }
        className={inputClass}
      />
      {provenance(key)}
    </div>
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = saveBillSchema.shape.fields.safeParse(fields);
    if (!result.success) {
      setValidation(
        result.error.issues[0]?.message ?? "Check the form fields.",
      );
      return;
    }
    setValidation(null);
    onSave(result.data);
  };
  return (
    <form onSubmit={submit} className="min-w-0 space-y-6">
      <fieldset
        disabled={saving || disabled}
        className="min-w-0 space-y-5 disabled:opacity-60"
      >
        <legend className="mb-4 text-sm font-bold">Bill details</legend>
        {textField("name", "Bill / item name")}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {textField("retailer", "Store / retailer")}
          {textField("brand", "Brand", 120)}
          {textField("invoiceNumber", "Invoice / receipt number")}
          <div className="min-w-0 text-xs font-semibold">
            <label htmlFor="bill-category">Category</label>
            <select
              id="bill-category"
              value={fields.category ?? ""}
              onChange={(event) =>
                update(
                  "category",
                  event.target.value
                    ? (event.target.value as BillFields["category"])
                    : null,
                )
              }
              className={inputClass}
            >
              <option value="">Uncategorized</option>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            {provenance("category")}
          </div>
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {textField("serialNumber", "Serial number / IMEI")}
          {textField("modelNumber", "Model number")}
          {textField("barcode", "Barcode / EAN / UPC")}
          {dateField("purchaseDate", "Purchase date")}
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_100px] gap-4">
          <div className="min-w-0 text-xs font-semibold">
            <label htmlFor="bill-price">Amount paid</label>
            <input
              id="bill-price"
              type="number"
              inputMode="decimal"
              min="0"
              max="9999999999.99"
              step="0.01"
              value={fields.purchasePrice ?? ""}
              onChange={(event) =>
                update("purchasePrice", event.target.value || null)
              }
              className={inputClass}
            />
            {provenance("purchasePrice")}
          </div>
          <div className="min-w-0 text-xs font-semibold">
            <label htmlFor="bill-currency">Currency</label>
            <input
              id="bill-currency"
              value={fields.currency}
              onChange={(event) =>
                update("currency", event.target.value.toUpperCase())
              }
              maxLength={3}
              minLength={3}
              required
              className={inputClass}
            />
            {provenance("currency")}
          </div>
        </div>
        <div className="border-t border-border pt-5">
          <h3 className="mb-4 text-sm font-bold">Warranty & returns</h3>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 text-xs font-semibold">
              <label htmlFor="bill-warranty-months">Warranty (months)</label>
              <input
                id="bill-warranty-months"
                type="number"
                min="0"
                max="1200"
                step="1"
                value={fields.warrantyMonths ?? ""}
                onChange={(event) =>
                  update(
                    "warrantyMonths",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
                className={inputClass}
              />
              {provenance("warrantyMonths")}
            </div>
            {dateField("warrantyExpiresAt", "Warranty ends")}
            <div className="min-w-0 text-xs font-semibold">
              <label htmlFor="bill-return-days">Return window (days)</label>
              <input
                id="bill-return-days"
                type="number"
                min="0"
                max="3650"
                step="1"
                value={fields.returnWindowDays ?? ""}
                onChange={(event) =>
                  update(
                    "returnWindowDays",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
                className={inputClass}
              />
              {provenance("returnWindowDays")}
            </div>
            {dateField("returnExpiresAt", "Return deadline")}
          </div>
        </div>
        <label htmlFor="bill-notes" className="block text-xs font-semibold">
          Notes
          <textarea
            id="bill-notes"
            rows={3}
            maxLength={4000}
            value={fields.notes ?? ""}
            onChange={(event) => update("notes", event.target.value || null)}
            className={inputClass}
          />
        </label>
        <fieldset className="border-t border-border pt-4">
          <legend className="text-xs font-semibold">
            Remind me before the deadline
          </legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {[30, 7, 1].map((days) => (
              <label
                key={days}
                className="inline-flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={fields.reminderDays.includes(days)}
                  onChange={(event) =>
                    update(
                      "reminderDays",
                      event.target.checked
                        ? [...fields.reminderDays, days]
                        : fields.reminderDays.filter((day) => day !== days),
                    )
                  }
                />
                {days} {days === 1 ? "day" : "days"}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>
      {error || validation ? (
        <p
          role="alert"
          className="rounded-sm border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error || validation}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={saving || disabled}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[0_4px_0_0_var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving ? "Saving..." : "Save to vault"}
      </button>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5" />
        Private to your account
      </p>
    </form>
  );
}
