import { afterEach, describe, expect, it, vi } from "vitest";
import { schedulePwaRegistration } from "../src/lib/pwa";

class Worker extends EventTarget {
  state = "installing";
}

class Registration extends EventTarget {
  waiting: Worker | null = null;
  installing: Worker | null = null;
  update = vi.fn(async () => this);
}

function browser(controller: Worker | null = new Worker()) {
  vi.stubEnv("PROD", true);
  const registration = new Registration();
  const container = Object.assign(new EventTarget(), {
    controller,
    getRegistration: vi.fn(async () => registration),
    register: vi.fn(async () => registration),
  });
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  const window = {
    isSecureContext: true,
    requestIdleCallback: vi.fn(() => 1),
    cancelIdleCallback: vi.fn(),
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
    location: { reload: vi.fn() },
  };
  vi.stubGlobal("navigator", { serviceWorker: container });
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", document);
  return { registration, container, document, window };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("PWA update lifecycle", () => {
  it("observes an existing waiting update before idle registration runs", async () => {
    const { registration, container } = browser();
    registration.waiting = Object.assign(new Worker(), { state: "installed" });
    const notify = vi.fn();
    const cleanup = schedulePwaRegistration(notify);
    await settle();
    expect(notify).toHaveBeenCalledWith(registration);
    expect(container.register).not.toHaveBeenCalled();
    cleanup();
  });

  it("recognizes an already-installed worker when attaching state listeners", async () => {
    const { registration } = browser();
    registration.installing = Object.assign(new Worker(), {
      state: "installed",
    });
    const notify = vi.fn();
    const cleanup = schedulePwaRegistration(notify);
    await settle();
    expect(registration.waiting).toBeNull();
    expect(notify).toHaveBeenCalledOnce();
    cleanup();
  });

  it("announces installed state even before the registration waiting getter updates", async () => {
    const { registration } = browser();
    const worker = new Worker();
    registration.installing = worker;
    const notify = vi.fn();
    const cleanup = schedulePwaRegistration(notify);
    await settle();
    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));
    expect(registration.waiting).toBeNull();
    expect(notify).toHaveBeenCalledOnce();
    registration.waiting = worker;
    worker.dispatchEvent(new Event("statechange"));
    expect(notify).toHaveBeenCalledOnce();
    cleanup();
  });

  it("finds a missed waiting update on visibility without repeating prompts or making an early network check", async () => {
    const { registration, document } = browser();
    const notify = vi.fn();
    const cleanup = schedulePwaRegistration(notify);
    await settle();
    registration.waiting = Object.assign(new Worker(), { state: "installed" });
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(notify).toHaveBeenCalledOnce();
    expect(registration.update).not.toHaveBeenCalled();
    cleanup();
  });

  it("does not call the first controller an app update", async () => {
    const { registration, container } = browser(null);
    const worker = Object.assign(new Worker(), { state: "installed" });
    registration.installing = worker;
    // Browsers can expose the first installed worker as temporarily waiting.
    registration.waiting = worker;
    const notify = vi.fn();
    const cleanup = schedulePwaRegistration(notify);
    await settle();
    expect(notify).not.toHaveBeenCalled();
    registration.waiting = null;
    container.controller = worker;
    container.dispatchEvent(new Event("controllerchange"));
    expect(notify).not.toHaveBeenCalled();
    cleanup();
  });

  it("announces another tab's activation without reloading this tab", async () => {
    const { container, window } = browser();
    const notify = vi.fn();
    const cleanup = schedulePwaRegistration(notify);
    await settle();
    container.controller = new Worker();
    container.dispatchEvent(new Event("controllerchange"));
    expect(notify).toHaveBeenCalledOnce();
    expect(window.location.reload).not.toHaveBeenCalled();
    cleanup();
  });

  it("cleans up listeners and never announces after disposal", async () => {
    const { registration, document, container } = browser();
    const notify = vi.fn();
    const cleanup = schedulePwaRegistration(notify);
    await settle();
    cleanup();
    registration.waiting = new Worker();
    container.controller = new Worker();
    document.dispatchEvent(new Event("visibilitychange"));
    container.dispatchEvent(new Event("controllerchange"));
    registration.dispatchEvent(new Event("updatefound"));
    expect(notify).not.toHaveBeenCalled();
  });

  it("leaves development sessions free of service-worker work", () => {
    const { container } = browser();
    vi.stubEnv("PROD", false);
    schedulePwaRegistration(vi.fn())();
    expect(container.getRegistration).not.toHaveBeenCalled();
    expect(container.register).not.toHaveBeenCalled();
  });
});
