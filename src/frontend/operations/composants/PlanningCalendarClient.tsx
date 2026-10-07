"use client";

import Link from "next/link";
import FullCalendar from "@fullcalendar/react";
import "../fullcalendar.css";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import frLocale from "@fullcalendar/core/locales/fr";
import { useCallback, useState } from "react";
import type { OperationStatus } from "@/shared/operations/statuts";

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
    "Terminée",
    "Rapportée",
    "Retardée",
    "Annulée",
  ]);

  const fetchEvents = useCallback(async (startStr: string, endStr: string) => {
    try {
      const res = await fetch(`/api/operations/planning?start=${startStr}&end=${endStr}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch {
      // Ignorer
    }
  }, []);

  const handleDatesSet = (arg: { startStr: string; endStr: string }) => {
    fetchEvents(arg.startStr, arg.endStr);
  };

  const filteredEvents = events.filter((ev) => statutFilter.includes(ev.extendedProps.statut));

  const toggleStatut = (statut: string) => {
    setStatutFilter((prev) =>
      prev.includes(statut) ? prev.filter((s) => s !== statut) : [...prev, statut]
    );
  };

  return (
    <div className="space-y-gutter-md p-margin-mobile lg:p-margin-desktop">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">
            Planning des interventions
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Vue calendrier des opérations planifiées, en cours et réalisées.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/operations"
            className="inline-flex items-center gap-2 rounded-xl border border-outline-variant bg-surface px-4 py-2.5 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[20px]">list</span>
            Vue liste
          </Link>
          <Link
            href="/operations/nouveau"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-label-md text-label-md font-semibold text-on-primary shadow-sm hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Nouvelle opération
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-sm">
        <span className="font-label-sm text-label-sm font-bold uppercase text-outline">
          Filtres :
        </span>
        {[
          { label: "Planifiée", val: "Planifiée", color: "bg-status-planned" },
          { label: "Affectée", val: "Affectée", color: "bg-status-assigned" },
          { label: "En route", val: "En route", color: "bg-status-on-route" },
          { label: "En cours", val: "En cours", color: "bg-status-in-progress" },
          { label: "Terminée", val: "Terminée", color: "bg-status-completed" },
          { label: "Retardée", val: "Retardée", color: "bg-status-delayed" },
          { label: "Annulée", val: "Annulée", color: "bg-status-cancelled" },
        ].map((item) => {
          const active = statutFilter.includes(item.val);
          return (
            <button
              key={item.val}
              type="button"
              onClick={() => toggleStatut(item.val)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-label-md text-label-md transition-all ${
                active
                  ? "bg-surface-container-high text-on-surface"
                  : "bg-surface text-outline line-through"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
              {item.label}
            </button>
          );
        })}
      </div>

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
          events={filteredEvents}
          datesSet={handleDatesSet}
          eventContent={(eventInfo) => (
            <div className="overflow-hidden p-1">
              <div className="font-bold truncate">{eventInfo.event.title}</div>
              {eventInfo.event.extendedProps.site && (
                <div className="text-[11px] opacity-90 truncate">
                  {eventInfo.event.extendedProps.site}
                </div>
              )}
            </div>
          )}
          eventClick={(info) => {
            window.location.href = `/operations/${info.event.id}`;
          }}
          height="auto"
        />
      </div>
    </div>
  );
}
