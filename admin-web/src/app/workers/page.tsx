"use client";

import { useState } from "react";
import { useStore } from "@/hooks/use-store";
import { fleetRows } from "@/lib/selectors";
import { ConflictError, store } from "@/lib/store";
import { EmptyState, ErrorNote, Field, Modal, PageHeader } from "@/components/ui";
import { relativeTime, todayIso } from "@/lib/time";

export default function WorkersPage() {
  const state = useStore();
  const rows = fleetRows(state);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const today = todayIso();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      store.addWorker({ name: name.trim(), phone, status: "ACTIVE" });
      setAdding(false);
      setName("");
      setPhone("");
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ConflictError ? caught.message : "We could not add that worker.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workers"
        description="Collection crew who sign in to the worker app and run today's routes."
        action={
          <button type="button" onClick={() => setAdding(true)} className="btn-primary">
            Add worker
          </button>
        }
      />

      {state.workers.length === 0 ? (
        <EmptyState
          title="No workers added"
          description="Add the collection crew so they can sign in and start their routes."
          action={
            <button type="button" onClick={() => setAdding(true)} className="btn-primary">
              Add worker
            </button>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[14px]">
            <thead className="border-b border-line text-[11px] uppercase tracking-[0.07em] text-ink-muted">
              <tr>
                {["Worker", "Mobile", "Vehicle today", "Route today", "Last active", "Status", ""].map(
                  (head) => (
                    <th key={head} scope="col" className="px-5 py-3 font-semibold">
                      {head}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {state.workers.map((worker) => {
                const assignment = state.assignments.find(
                  (a) => a.workerId === worker.id && a.assignmentDate === today && a.status !== "CANCELLED",
                );
                const row = rows.find((r) => r.worker?.id === worker.id) ?? null;

                return (
                  <tr key={worker.id} className="hover:bg-surface-muted/60">
                    <td className="px-5 py-3.5 font-semibold">{worker.name}</td>
                    <td className="px-5 py-3.5 tabular-nums text-ink-muted">+91 {worker.phone}</td>
                    <td className="px-5 py-3.5">
                      {assignment
                        ? state.vehicles.find((v) => v.id === assignment.vehicleId)?.vehicleNumber ?? "—"
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      {assignment
                        ? state.routes.find((r) => r.id === assignment.routeId)?.routeName ?? "—"
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-ink-muted">
                      {row?.location ? relativeTime(row.location.recordedAt) : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${
                          worker.status === "ACTIVE"
                            ? "bg-brand-light text-brand-dark"
                            : "bg-surface-muted text-ink-muted"
                        }`}
                      >
                        {worker.status === "ACTIVE" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          store.setWorkerStatus(
                            worker.id,
                            worker.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                          )
                        }
                        className="text-[13px] font-semibold text-brand hover:text-brand-dark"
                      >
                        {worker.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={adding} title="Add worker" onClose={() => setAdding(false)}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name">
            <input value={name} onChange={(event) => setName(event.target.value)} className="field" />
          </Field>
          <Field label="Mobile number" hint="Used to sign in to the worker app.">
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric"
              className="field"
              placeholder="98XXXXXXXX"
            />
          </Field>
          <ErrorNote message={error} />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={name.trim().length < 2 || !/^[6-9]\d{9}$/.test(phone)}
              className="btn-primary"
            >
              Save worker
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
