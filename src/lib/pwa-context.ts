import { createContext, useContext } from "react";

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaContextValue {
  installed: boolean;
  installReady: boolean;
  installSuppressed: boolean;
  installing: boolean;
  canPromptInstall: boolean;
  dismissInstall: () => void;
  acknowledgeInstalled: () => void;
  requestInstall: () => Promise<
    "accepted" | "dismissed" | "unavailable" | "busy"
  >;
}

export const PwaContext = createContext<PwaContextValue>({
  installed: false,
  installReady: false,
  installSuppressed: false,
  installing: false,
  canPromptInstall: false,
  dismissInstall: () => {},
  acknowledgeInstalled: () => {},
  requestInstall: async () => "unavailable",
});

export function usePwa() {
  return useContext(PwaContext);
}
