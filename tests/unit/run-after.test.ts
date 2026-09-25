import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/server", () => ({ after: vi.fn() }));

import { after } from "next/server";
import { runAfterResponse } from "@/backend/platform/execution-differee/execution-differee";

const afterMock = vi.mocked(after);

function outsideScopeError(): Error {
  // Même forme que l'erreur de next/dist/server/after/after.js : code non énumérable.
  return Object.defineProperty(
    new Error("`after` was called outside a request scope."),
    "__NEXT_ERROR_CODE",
    { value: "E468", enumerable: false, configurable: true }
  );
}

describe("runAfterResponse", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    afterMock.mockReset();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("(a) en contexte de requête : la tâche est enregistrée via after() et n'est PAS attendue", async () => {
    let registered: (() => unknown) | undefined;
    afterMock.mockImplementation(((cb: () => unknown) => {
      registered = cb;
    }) as never);

    let finished = false;
    const slow = async () => {
      await new Promise((r) => setTimeout(r, 50));
      finished = true;
    };

    await runAfterResponse(slow);

    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(registered).toBeDefined();
    expect(finished).toBe(false); // l'appelant a rendu la main avant la fin de la tâche lente
    await registered!();
    expect(finished).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("(b) hors contexte de requête (E468) : la tâche s'exécute en ligne, sans aucune sortie console", async () => {
    afterMock.mockImplementation((() => {
      throw outsideScopeError();
    }) as never);
    const task = vi.fn(async () => {});

    await runAfterResponse(task);

    expect(task).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("(c) autre erreur synchrone de after() : la tâche s'exécute en ligne ET le nom de l'erreur (seul) est journalisé", async () => {
    class OnCloseRegistrationError extends Error {
      constructor() {
        super("détail interne mongodb://secret@hote");
        this.name = "InvariantError";
      }
    }
    afterMock.mockImplementation((() => {
      throw new OnCloseRegistrationError();
    }) as never);
    const task = vi.fn(async () => {});

    await runAfterResponse(task);

    expect(task).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls.flat().map(String).join("\n");
    expect(logged).toContain("InvariantError");
    expect(logged).not.toContain("mongodb://");
    expect(logged).not.toContain("détail interne");
  });

  it("(d) échec de la tâche : seul error.name est journalisé et l'appelant n'est jamais rejeté", async () => {
    let registered: (() => Promise<void>) | undefined;
    afterMock.mockImplementation(((cb: () => Promise<void>) => {
      registered = cb;
    }) as never);
    const failing = async () => {
      const error = new Error("jeton=SECRET adresse=awa@srh.ci");
      error.name = "MongoServerError";
      throw error;
    };

    await expect(runAfterResponse(failing)).resolves.toBeUndefined();
    await expect(registered!()).resolves.toBeUndefined();

    const logged = errorSpy.mock.calls.flat().map(String).join("\n");
    expect(logged).toContain("MongoServerError");
    expect(logged).not.toContain("SECRET");
    expect(logged).not.toContain("awa@srh.ci");

    // Même garantie sur le chemin « en ligne » (hors contexte de requête).
    errorSpy.mockClear();
    afterMock.mockImplementation((() => {
      throw outsideScopeError();
    }) as never);
    await expect(runAfterResponse(failing)).resolves.toBeUndefined();
    expect(errorSpy.mock.calls.flat().map(String).join("\n")).not.toContain("SECRET");
  });
});
