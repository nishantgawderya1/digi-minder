import { createContext, useContext } from "react";

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaContextValue {
  installed: boolean;
  canPromptInstall: boolean;
  requestInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

export const PwaContext = createContext<PwaContextValue>({
  installed: false,
  canPromptInstall: false,
  requestInstall: async () => "unavailable",
});

export function usePwa() {
  return useContext(PwaContext);
}
