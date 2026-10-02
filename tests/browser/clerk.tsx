// This module replaces Clerk only in the isolated browser-test build.
// eslint-disable-next-line react-refresh/only-export-components
export const useUser = () => ({ user: { firstName: "Test" } });
export const UserButton = () => (
  <button
    aria-label="Account"
    className="h-8 w-8 rounded-full bg-primary text-primary-foreground"
  >
    T
  </button>
);
