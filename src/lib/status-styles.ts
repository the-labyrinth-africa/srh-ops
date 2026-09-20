import type { OperationStatus } from "@/types";

export const STATUS_CONFIG: Record<
  OperationStatus,
  { color: string; bg: string; border: string; icon: string; label: string }
> = {
  Planifiée: {
    color: "text-status-planned",
    bg: "bg-status-planned/10",
    border: "border-status-planned/30",
    icon: "event",
    label: "Planifiée",
  },
  Affectée: {
    color: "text-status-assigned",
    bg: "bg-status-assigned/10",
    border: "border-status-assigned/30",
    icon: "assignment_ind",
    label: "Affectée",
  },
  "En route": {
    color: "text-status-on-route",
    bg: "bg-status-on-route/10",
    border: "border-status-on-route/30",
    icon: "local_shipping",
    label: "En route",
  },
  "En cours": {
    color: "text-status-in-progress",
    bg: "bg-status-in-progress/10",
    border: "border-status-in-progress/30",
    icon: "engineering",
    label: "En cours",
  },
  Terminée: {
    color: "text-status-completed",
    bg: "bg-status-completed/10",
    border: "border-status-completed/30",
    icon: "check_circle",
    label: "Terminée",
  },
  Rapportée: {
    color: "text-status-reported",
    bg: "bg-status-reported/10",
    border: "border-status-reported/30",
    icon: "description",
    label: "Rapportée",
  },
  Retardée: {
    color: "text-status-delayed",
    bg: "bg-status-delayed/10",
    border: "border-status-delayed/30",
    icon: "warning",
    label: "Retardée",
  },
  Annulée: {
    color: "text-status-cancelled",
    bg: "bg-status-cancelled/10",
    border: "border-status-cancelled/30",
    icon: "cancel",
    label: "Annulée",
  },
};
