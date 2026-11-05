"use client";

import Link from "next/link";
import FullCalendar from "@fullcalendar/react";
import "../fullcalendar.css";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import frLocale from "@fullcalendar/core/locales/fr";
import { useCallback, useState } from "react";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  backgroundColor: string;
  borderColor: string;
  extendedProps: {
    statut: string;
    site?: string;
    vehicule?: string;
    capaciteVehiculeLitres?: number;
    volume?: number;
    dureeEstimeeMinutes?: number;
    secteur?: string;
  };
}

export function PlanningCalendarClient() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState("");
  const fetchEvents = useCallback(async (currentStart: Date) => {
    setError("");
    try {
      const mois = currentStart.toISOString().slice(0, 7);
      const res = await fetch(`/api/previsions/collectes?mois=${mois}`);
      const data: { previsions?: unknown; error?: unknown } = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Impossible de charger le planning prévisionnel.");
      if (!Array.isArray(data.previsions)) throw new Error("Les prévisions reçues sont invalides.");
      setEvents(data.previsions.map((item: { datePrevue: string; site: string; commune: string; quantiteEstimeeLitres: number; dureeEstimeeMinutes: number; capaciteVehiculeLitres?: number; numeroPassage: number; tournee: string; secteur: string; vehicule?: string }) => ({
        id: `${item.datePrevue}-${item.site}-${item.tournee}-${item.numeroPassage}`,
        title: `${item.tournee} · ${item.quantiteEstimeeLitres} L`,
        start: item.datePrevue,
        allDay: true,
        backgroundColor: "#247a59",
        borderColor: "#1b6046",
        extendedProps: { statut: "Prévision", site: `${item.site} · ${item.commune}`, volume: item.quantiteEstimeeLitres, dureeEstimeeMinutes: item.dureeEstimeeMinutes, capaciteVehiculeLitres: item.capaciteVehiculeLitres, secteur: item.secteur, vehicule: item.vehicule },
      })));
    } catch (cause) {
      setEvents([]);
      setError(cause instanceof Error ? cause.message : "Erreur réseau lors du chargement du planning.");
    }
  }, []);

  const handleDatesSet = (arg: { view: { currentStart: Date } }) => {
    fetchEvents(arg.view.currentStart);
  };

  return (
    <div className="space-y-gutter-md p-margin-mobile lg:p-margin-desktop">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">
            Planning prévisionnel des collectes
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Tournées calculées depuis les collectes enregistrées et les ressources disponibles.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/operations"
            className="inline-flex items-center gap-2 rounded-xl border border-outline-variant bg-surface px-4 py-2.5 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[20px]">list</span>
            Vue liste
          </Link>
          <Link
            href="/previsions"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-label-md text-label-md font-semibold text-on-primary shadow-sm hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Prévisions détaillées
          </Link>
          <Link href="/operations/nouveau" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-label-md text-label-md font-semibold text-on-primary"><span className="material-symbols-outlined text-[20px]">add</span>Enregistrer une collecte</Link>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-error/30 bg-error-container/20 p-4 text-error">{error}</p>}

      <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md shadow-sm">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={frLocale}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={events}
          datesSet={handleDatesSet}
          eventContent={(eventInfo) => (
            <div className="overflow-hidden p-1">
              <div className="truncate text-xs font-bold">{eventInfo.event.title}</div>
              {eventInfo.event.extendedProps.site && (
                <div className="truncate text-xs opacity-90">
                  {eventInfo.event.extendedProps.site}
                </div>
              )}
              <div className="text-xs opacity-80">{eventInfo.event.extendedProps.secteur} · {eventInfo.event.extendedProps.vehicule ?? "véhicule à affecter"}{eventInfo.event.extendedProps.capaciteVehiculeLitres ? ` (${eventInfo.event.extendedProps.capaciteVehiculeLitres} L)` : ""} · {eventInfo.event.extendedProps.dureeEstimeeMinutes} min</div>
            </div>
          )}
          eventClick={(info) => info.jsEvent.preventDefault()}
          height="auto"
        />
      </div>
    </div>
  );
}
