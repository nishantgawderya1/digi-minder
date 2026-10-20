// Warm route modules on hover/focus/touch and revalidate private data on navigation.
// Each navigation still goes through the loader's server-side authorization.
export const navigationOptions = {
  defaultPreload: "intent",
  defaultPreloadDelay: 50,
  defaultPreloadStaleTime: 0,
  defaultPendingMs: 120,
  defaultPendingMinMs: 0,
  defaultPendingComponent: Loading,
} as const;
import { Loading } from "./components/loading";
