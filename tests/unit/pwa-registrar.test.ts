import { describe, expect, it, vi } from "vitest";
import { removeLegacyServiceWorkers } from "@/frontend/terrain/composants/ServiceWorkerCleanup";

describe("removeLegacyServiceWorkers", () => {
  it("renvoie 'unsupported' si serviceWorker n'est pas supporté", async () => {
    const res = await removeLegacyServiceWorkers(undefined);
    expect(res).toBe("unsupported");
  });

  it("désinstalle les service workers existants", async () => {
    const unregisterMock = vi.fn(() => Promise.resolve(true));
    const unrelatedUnregisterMock = vi.fn(() => Promise.resolve(true));
    const swMock = {
      getRegistrations: vi.fn(() =>
        Promise.resolve([
          {
            scope: "https://srh.example/",
            active: { scriptURL: "https://srh.example/sw.js" },
            unregister: unregisterMock,
          } as unknown as ServiceWorkerRegistration,
          {
            scope: "https://srh.example/",
            active: { scriptURL: "https://srh.example/another-worker.js" },
            unregister: unrelatedUnregisterMock,
          } as unknown as ServiceWorkerRegistration,
        ])
      ),
    } as unknown as ServiceWorkerContainer;

    const res = await removeLegacyServiceWorkers(swMock);
    expect(res).toBe("cleaned");
    expect(unregisterMock).toHaveBeenCalled();
    expect(unrelatedUnregisterMock).not.toHaveBeenCalled();
  });
});
