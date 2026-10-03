import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOutbox,
  enqueueMutation,
  getAllPending,
  removePending,
  replayOutbox,
} from "@/lib/offline/outbox";

type FetchMock = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<{ ok: boolean }>;

describe("outbox hors-ligne (IndexedDB)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn<FetchMock>(() => Promise.resolve({ ok: true })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("enfile une mutation et la mentionne dans la liste", async () => {
    await enqueueMutation({ kind: "statut", id: "op1", payload: { statut: "En cours" } });
    const pending = await getAllPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation).toMatchObject({ kind: "statut", id: "op1" });
  });

  it("rejoue FIFO puis vide l'outbox", async () => {
    const fetchMock = vi.fn<FetchMock>(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await enqueueMutation({ kind: "statut", id: "op1", payload: { statut: "En cours" } });
    await enqueueMutation({ kind: "statut", id: "op1", payload: { statut: "Terminée" } });

    const res = await replayOutbox();
    expect(res).toEqual({ replayed: 2, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toContain("/api/operations/op1/statut");
    expect(fetchMock.mock.calls[0]![1]?.method).toBe("PATCH");
    expect(await getAllPending()).toHaveLength(0);
  });

  it("ne supprime pas une mutation refusée (sera rejouée)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false })));

    await enqueueMutation({ kind: "statut", id: "op1", payload: { statut: "En cours" } });
    const res = await replayOutbox();
    expect(res).toEqual({ replayed: 0, failed: 1 });
    expect(await getAllPending()).toHaveLength(1);
  });

  it("rejoue les photos une par une, au format attendu par la route (`{ photo, nom }`)", async () => {
    const fetchMock = vi.fn<FetchMock>(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await enqueueMutation({
      kind: "photos",
      id: "op1",
      photos: [
        { dataUrl: "data:image/png;base64,AAAA", nom: "a.png" },
        { dataUrl: "data:image/png;base64,BBBB", nom: "b.png" },
      ],
    });

    expect(await replayOutbox()).toEqual({ replayed: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe("/api/operations/op1/photos");
      expect(init?.method).toBe("POST");
    }
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { photo: "data:image/png;base64,AAAA", nom: "a.png" },
      { photo: "data:image/png;base64,BBBB", nom: "b.png" },
    ]);
    expect(await getAllPending()).toHaveLength(0);
  });

  it("photo refusée en cours de lot : seules les photos non envoyées restent en attente (pas de doublon au rejeu)", async () => {
    const reponses = [{ ok: true }, { ok: false }];
    const fetchMock = vi.fn<FetchMock>(() => Promise.resolve(reponses.shift() ?? { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await enqueueMutation({
      kind: "photos",
      id: "op1",
      photos: [
        { dataUrl: "data:image/png;base64,AAAA", nom: "a.png" },
        { dataUrl: "data:image/png;base64,BBBB", nom: "b.png" },
        { dataUrl: "data:image/png;base64,CCCC", nom: "c.png" },
      ],
    });

    expect(await replayOutbox()).toEqual({ replayed: 0, failed: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const enAttente = await getAllPending();
    expect(enAttente).toHaveLength(1);
    expect(enAttente[0].mutation.photos?.map((p) => p.nom)).toEqual(["b.png", "c.png"]);

    expect(await replayOutbox()).toEqual({ replayed: 1, failed: 0 });
    expect(fetchMock.mock.calls.slice(2).map(([, init]) => JSON.parse(String(init?.body)).nom)).toEqual(["b.png", "c.png"]);
    expect(await getAllPending()).toHaveLength(0);
  });

  it("mutation de photos vide : retirée sans appel réseau", async () => {
    const fetchMock = vi.fn<FetchMock>(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await enqueueMutation({ kind: "photos", id: "op1", photos: [] });

    expect(await replayOutbox()).toEqual({ replayed: 1, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getAllPending()).toHaveLength(0);
  });

  it("supprime une mutation par timestamp", async () => {
    await enqueueMutation({ kind: "photos", id: "op1", photos: [{ dataUrl: "data:image/png;base64,abcd", nom: "a.png" }] });
    const pending = await getAllPending();
    await removePending(pending[0].ts);
    expect(await getAllPending()).toHaveLength(0);
  });
});
