// Opt-in network latency for interaction tests; the production build never loads this module.
export async function simulateRequest(name: string) {
  const counts = JSON.parse(
    sessionStorage.getItem("test-request-counts") || "{}",
  );
  counts[name] = (counts[name] || 0) + 1;
  sessionStorage.setItem("test-request-counts", JSON.stringify(counts));
  const delay = Number(sessionStorage.getItem("test-service-latency") || 0);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}
