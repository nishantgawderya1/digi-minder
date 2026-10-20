import { simulateRequest } from "./latency";

export const requireCurrentUser = async () => {
  await simulateRequest("route-auth");
  return { userId: "browser-test-user" };
};
