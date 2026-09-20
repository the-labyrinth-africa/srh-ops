"use client";

import Link from "next/link";
import FullCalendar from "@fullcalendar/react";
import "@/app/fullcalendar.css";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import frLocale from "@fullcalendar/core/locales/fr";
import { useCallback, useEffect, useState } from "react";
import type { OperationStatus } from "@/types";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  extendedProps: {
    statut: OperationStatus;
    site?: string;
    equipe?: string;
    vehicule?: string;
  };
}

export function PlanningCalendarClient() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [statutFilter, setStatutFilter] = useState<string[]>([
    "Planifiée",
    "Affectée",
    "En route",
    "En cours",
    "Retardée",
  ]);

  const loadEvents = useCallback(async (start?: Date, end?: Date) => {
    try {
      const params = new URLSearchParams();
      if (start) params.set("dateDebut", start.toISOString());
      if (end) params.set("dateFin", end.toISOString());
      const res = await fetch(`/api/operations/planning?${params}`);
      if (!res.ok) return;
      const text = await res.text();
      if (!text) return;
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        setEvents(
          data.filter((e: CalendarEvent) =>
            e.extendedProps?.statut ? statutFilter.includes(e.extendedProps.statut) : true
          )
        );
      }
    } catch (err) {
      console.error("Erreur chargement événements calendrier:", err);
    }
  }, [statutFilter]);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    loadEvents(start, end);
  }, [loadEvents]);

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="relative z-10 flex flex-col gap-4 px-margin-mobile py-6 sm:flex-row sm:items-center sm:justify-between lg:px-margin-desktop lg:py-8">
        <div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
            Planning Hebdomadaire
          </h1>
          <p className="max-w-xl font-body-md text-body-md text-on-surface-variant">
            Vue d&apos;ensemble des opérations de collecte et des interventions planifiées.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/operations"
            className="flex items-center gap-2 rounded-full bg-surface-container px-5 py-3 font-label-md text-label-md text-on-surface shadow-sm hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]">today</span>
            Aujourd&apos;hui
          </Link>
          <Link
            href="/operations/nouveau"
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-label-md text-label-md text-on-primary shadow-md hover:bg-primary-container"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Planifier une collecte
          </Link>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col gap-6 px-margin-mobile pb-margin-mobile lg:flex-row lg:px-margin-desktop lg:pb-margin-desktop">
        <aside className="flex w-full shrink-0 flex-col gap-6 lg:w-72">
          <div className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
            <h3 className="mb-4 font-headline-sm text-headline-sm text-on-surface">Filtres</h3>
            <div className="flex flex-col gap-2">
              {(["Planifiée", "Affectée", "En route", "En cours", "Terminée", "Retardée"] as OperationStatus[]).map((s) => (
                <label key={s} className="group flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={statutFilter.includes(s)}
                    onChange={(e) => {
                      setStatutFilter((prev) =>
                        e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)
                      );
                    }}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="font-body-md text-body-md text-on-surface group-hover:text-primary">{s}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
            <p className="mb-2 font-label-md text-label-md uppercase tracking-widest text-on-surface-variant">Légende</p>
            <div className="flex flex-col gap-2 font-label-sm text-label-sm">
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-status-planned" /> Planifiée</span>
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-status-assigned" /> Affectée</span>
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-status-on-route" /> En route</span>
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-status-in-progress" /> En cours</span>
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-status-delayed" /> Retardée</span>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 overflow-hidden rounded-xl bg-surface-container-lowest p-4 shadow-sm lg:p-6">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            locales={[frLocale]}
            locale="fr"
            buttonText={{
              today: "Aujourd'hui",
              month: "Mois",
              week: "Semaine",
              day: "Jour",
              list: "Planning",
            }}
            allDayText="Toute la journée"
            noEventsText="Aucune intervention à afficher"
            height="auto"
            events={events}
            eventClick={(info) => {
              window.location.href = `/operations/${info.event.id}`;
            }}
            datesSet={(arg) => loadEvents(arg.start, arg.end)}
            slotMinTime="06:00:00"
            slotMaxTime="20:00:00"
            allDaySlot={false}
            nowIndicator
          />
        </div>
      </div>
    </div>
  );
}
