import { describe, expect, it, vi } from "vitest";
import { manageServiceWorker } from "@/frontend/terrain/composants/PwaRegistrar";

describe("manageServiceWorker", () => {
  it("renvoie 'unsupported' si serviceWorker n'est pas supporté", async () => {
    const res = await manageServiceWorker({}, undefined);
    expect(res).toBe("unsupported");
  });

  it("enregistre le service worker par défaut (scope '/')", async () => {
    const registerMock = vi.fn(() => Promise.resolve({ scope: "/" } as ServiceWorkerRegistration));
    const swMock = {
      register: registerMock,
      getRegistrations: vi.fn(),
    } as unknown as ServiceWorkerContainer;

    const res = await manageServiceWorker({}, swMock);
    expect(res).toBe("registered");
    expect(registerMock).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("désinstalle le service worker et nettoie le cache si NEXT_PUBLIC_ENABLE_PWA est 'false'", async () => {
    const unregisterMock = vi.fn(() => Promise.resolve(true));
    const swMock = {
      register: vi.fn(),
      getRegistrations: vi.fn(() =>
        Promise.resolve([{ unregister: unregisterMock } as unknown as ServiceWorkerRegistration])
      ),
    } as unknown as ServiceWorkerContainer;

    const res = await manageServiceWorker({ NEXT_PUBLIC_ENABLE_PWA: "false" }, swMock);
    expect(res).toBe("cleaned");
    expect(swMock.register).not.toHaveBeenCalled();
    expect(unregisterMock).toHaveBeenCalled();
  });
});
