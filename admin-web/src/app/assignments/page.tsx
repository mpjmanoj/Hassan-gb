"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/hooks/use-store";
import { ConflictError, store } from "@swachhata/core";
import { EmptyState, ErrorNote, Field, Modal, PageHeader } from "@/components/ui";
import { todayIso } from "@swachhata/core";
import type { Assignment } from "@swachhata/core";

const STATUS_TONE: Record<Assignment["status"], string> = {
  SCHEDULED: "bg-surface-muted text-ink-muted",
  ACTIVE: "bg-brand-light text-brand-dark",
  COMPLETED: "bg-surface-muted text-ink-muted",
  CANCELLED: "bg-surface-muted text-ink-muted",
  ABSENT: "bg-danger-light text-danger",
};

export default function AssignmentsPage() {
  const state = useStore();
  const [date, setDate] = useState(todayIso());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      state.assignments
        .filter((assignment) => assignment.assignmentDate === date)
        .map((assignment) => ({
          assignment,
          ward: state.wards.find((w) => w.id === assignment.wardId) ?? null,
          route: state.routes.find((r) => r.id === assignment.routeId) ?? null,
          vehicle: state.vehicles.find((v) => v.id === assignment.vehicleId) ?? null,
          worker: state.workers.find((w) => w.id === assignment.workerId) ?? null,
        })),
    [state, date],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description="Vehicles, workers and routes are assigned per operating day — a ward is never permanently tied to one vehicle."
        action={
          <button type="button" onClick={() => setCreating(true)} className="btn-primary">
            Create assignment
          </button>
        }
      />

      <div className="flex items-center gap-3">
        <label htmlFor="date" className="label">
          Operating day
        </label>
        <input
          id="date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="field w-auto"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No route assignment has been created for this day"
          description="Assign a vehicle, worker and route so residents of that ward can track their collection."
          action={
            <button type="button" onClick={() => setCreating(true)} className="btn-primary">
              Create assignment
            </button>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[14px]">
            <thead className="border-b border-line text-[11px] uppercase tracking-[0.07em] text-ink-muted">
              <tr>
                {["Ward", "Route", "Vehicle", "Worker", "Status", ""].map((head) => (
                  <th key={head} scope="col" className="px-5 py-3 font-semibold">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ assignment, ward, route, vehicle, worker }) => (
                <tr key={assignment.id} className="hover:bg-surface-muted/60">
                  <td className="px-5 py-3.5 font-semibold">
                    {ward ? `Ward ${ward.wardNumber}` : "—"}
                    <span className="block text-[12px] font-normal text-ink-muted">{ward?.name}</span>
                  </td>
                  <td className="px-5 py-3.5">{route?.routeName ?? "—"}</td>
                  <td className="px-5 py-3.5">{vehicle?.vehicleNumber ?? "—"}</td>
                  <td className="px-5 py-3.5">{worker?.name ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${STATUS_TONE[assignment.status]}`}
                    >
                      {assignment.status.toLowerCase()}
                    </span>
                    {assignment.absenceReason ? (
                      <span className="mt-1 block text-[12px] text-ink-muted">
                        {assignment.absenceReason}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-3 text-[13px] font-semibold">
                      {assignment.isAbsent ? (
                        <button
                          type="button"
                          onClick={() => store.clearAbsence(assignment.id)}
                          className="text-brand hover:text-brand-dark"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => store.markAssignmentAbsent(assignment.id, null)}
                          className="text-warn hover:underline"
                        >
                          Mark absent
                        </button>
                      )}
                      {assignment.status !== "CANCELLED" && assignment.status !== "COMPLETED" ? (
                        <button
                          type="button"
                          onClick={() => store.cancelAssignment(assignment.id)}
                          className="text-danger hover:underline"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateAssignmentDialog
        open={creating}
        date={date}
        error={error}
        onClose={() => {
          setCreating(false);
          setError(null);
        }}
        onError={setError}
      />
    </div>
  );
}

function CreateAssignmentDialog({
  open,
  date,
  error,
  onClose,
  onError,
}: {
  open: boolean;
  date: string;
  error: string | null;
  onClose: () => void;
  onError: (message: string | null) => void;
}) {
  const state = useStore();
  const [areaId, setAreaId] = useState("");
  const [wardId, setWardId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [assignmentDate, setAssignmentDate] = useState(date);

  const wards = state.wards.filter((ward) => ward.areaId === areaId);
  const routes = state.routes.filter((route) => route.wardId === wardId);
  const vehicles = state.vehicles.filter((vehicle) => vehicle.active);
  const workers = state.workers.filter((worker) => worker.status === "ACTIVE");

  const complete = wardId && routeId && vehicleId && workerId && assignmentDate;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!complete) return;
    try {
      store.createAssignment({ routeId, wardId, vehicleId, workerId, assignmentDate });
      onClose();
    } catch (caught) {
      onError(
        caught instanceof ConflictError
          ? caught.message
          : "We could not create that assignment. Please try again.",
      );
    }
  };

  return (
    <Modal open={open} title="Create assignment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Operating day">
          <input
            type="date"
            value={assignmentDate}
            onChange={(event) => setAssignmentDate(event.target.value)}
            className="field"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Area">
            <select
              value={areaId}
              onChange={(event) => {
                setAreaId(event.target.value);
                setWardId("");
                setRouteId("");
              }}
              className="field"
            >
              <option value="">Select area</option>
              {state.areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Ward">
            <select
              value={wardId}
              disabled={!areaId}
              onChange={(event) => {
                setWardId(event.target.value);
                setRouteId("");
              }}
              className="field"
            >
              <option value="">Select ward</option>
              {wards.map((ward) => (
                <option key={ward.id} value={ward.id}>
                  Ward {ward.wardNumber} · {ward.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Route"
          hint={wardId && routes.length === 0 ? "This ward has no routes yet. Add one first." : undefined}
        >
          <select
            value={routeId}
            disabled={!wardId}
            onChange={(event) => setRouteId(event.target.value)}
            className="field"
          >
            <option value="">Select route</option>
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.routeName}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vehicle">
            <select
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
              className="field"
            >
              <option value="">Select vehicle</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.vehicleNumber}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Worker">
            <select
              value={workerId}
              onChange={(event) => setWorkerId(event.target.value)}
              className="field"
            >
              <option value="">Select worker</option>
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <ErrorNote message={error} />

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={!complete} className="btn-primary">
            Create assignment
          </button>
        </div>
      </form>
    </Modal>
  );
}
