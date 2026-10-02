import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { autosaveReview, unwrap } from "@/lib/bill-functions";
import { draftPatchSchema, type DraftPatch } from "@/lib/review";

export function useDraftAutosave(id: string, initialRevision: number) {
  const revision = useRef(initialRevision);
  const pending = useRef<DraftPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const running = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState<string | null>(null);
  const set = (value: string) => {
    if (mounted.current) setStatus(value);
  };
  const flush = useCallback(
    async function flush(): Promise<void> {
      clearTimeout(timer.current);
      if (running.current) {
        await running.current;
        if (Object.keys(pending.current).length) return flush();
        return;
      }
      if (!Object.keys(pending.current).length) return;
      const parsed = draftPatchSchema.safeParse(pending.current);
      if (!parsed.success) {
        set("Unsaved changes");
        if (mounted.current)
          setError("Complete the fields before saving changes.");
        throw new Error("Complete the fields before saving changes.");
      }
      const patch = parsed.data;
      pending.current = {};
      set("Saving changes...");
      const request = (async () => {
        try {
          const result = unwrap(
            await autosaveReview({
              data: { id, revision: revision.current, patch },
            }),
          );
          revision.current = result.revision;
          if (mounted.current) setError(null);
          set(
            Object.keys(pending.current).length ? "Unsaved changes" : "Saved",
          );
        } catch (cause) {
          pending.current = { ...patch, ...pending.current };
          const message =
            cause instanceof Error
              ? cause.message
              : "Changes couldn't be saved.";
          if (mounted.current) setError(message);
          set("Changes not saved");
          throw cause;
        }
      })();
      running.current = request;
      try {
        await request;
      } finally {
        running.current = null;
      }
      if (Object.keys(pending.current).length) return flush();
    },
    [id],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      void flush().catch(() => {});
    };
  }, [flush]);
  function change(patch: DraftPatch) {
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    set("Unsaved changes");
    timer.current = setTimeout(() => void flush().catch(() => {}), 600);
  }
  async function discard() {
    clearTimeout(timer.current);
    pending.current = {};
    await running.current?.catch(() => {});
    pending.current = {};
    if (mounted.current) setError(null);
    set("Saved");
  }
  useBlocker({
    shouldBlockFn: async () => {
      try {
        await flush();
        return false;
      } catch {
        return true;
      }
    },
    enableBeforeUnload: () =>
      !!running.current || !!Object.keys(pending.current).length,
  });
  return { change, flush, discard, status, error };
}
