"use client";

import Link from "next/link";
import { useState } from "react";
import type { Vehicle } from "@swachhata/core";
import { useStore } from "@/hooks/use-store";
import { fleetRows, type FleetRow } from "@swachhata/core";
import { getOps, messageFor } from "@/lib/ops";
import { StatusPill } from "@/components/status-pill";
import { EmptyState, ErrorNote, Field, Modal, PageHeader } from "@/components/ui";
import { relativeTime } from "@swachhata/core";

type Dialog =
  | { kind: "none" }
  | { kind: "add" }
  | { kind: "edit"; vehicle: Vehicle }
  | { kind: "absent"; row: FleetRow }
  | { kind: "retire"; vehicle: Vehicle };

const TYPES: Vehicle["vehicleType"][] = ["COMPACTOR", "TIPPER", "AUTO_TIPPER"];
const TYPE_LABEL: Record<Vehicle["vehicleType"], string> = {
  COMPACTOR: "Compactor",
  TIPPER: "Tipper",
  AUTO_TIPPER: "Auto tipper",
};

export default function VehiclesPage() {
  const state = useStore();
  const rows = fleetRows(state);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setDialog({ kind: "none" });
    setError(null);
  };

  // Every mutation goes through here so a rejected change shows a sentence, never a raw error.
  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      close();
    } catch (caught) {
      setError(messageFor(caught, "We could not save that change. Please try again."));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicles"
        description="Every collection vehicle registered to Hassan City, with today's assignment and status."
        action={
          <button type="button" onClick={() => setDialog({ kind: "add" })} className="btn-primary">
            Add vehicle
          </button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No vehicles added yet"
          description="Add your first collection vehicle to start assigning routes and workers."
          action={
            <button type="button" onClick={() => setDialog({ kind: "add" })} className="btn-primary">
              Add vehicle
            </button>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-[14px]">
            <thead className="border-b border-line text-[11px] uppercase tracking-[0.07em] text-ink-muted">
              <tr>
                {["Vehicle", "Worker", "Route", "Wards today", "Last GPS", "Status", ""].map((head) => (
                  <th key={head} scope="col" className="px-5 py-3 font-semibold">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.vehicle.id} className="hover:bg-surface-muted/60">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold">{row.vehicle.vehicleNumber}</p>
                    <p className="text-[12px] text-ink-muted">
                      {TYPE_LABEL[row.vehicle.vehicleType]}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">{row.worker?.name ?? "—"}</td>
                  <td className="px-5 py-3.5">{row.route?.routeName ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    {row.wards.length > 0
                      ? row.wards.map((w) => `Ward ${w.wardNumber}`).join(", ")
                      : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-ink-muted">
                    {row.location ? relativeTime(row.location.recordedAt) : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-3 whitespace-nowrap text-[13px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: "edit", vehicle: row.vehicle })}
                        className="text-brand hover:text-brand-dark"
                      >
                        Edit
                      </button>
                      {row.assignment && !row.assignment.isAbsent && row.assignment.status !== "COMPLETED" ? (
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: "absent", row })}
                          className="text-warn hover:underline"
                        >
                          Mark absent
                        </button>
                      ) : null}
                      {row.assignment?.isAbsent ? (
                        <button
                          type="button"
                          onClick={() => void run(() => getOps().clearAbsence(row.assignment!.id))}
                          className="text-brand hover:text-brand-dark"
                        >
                          Restore
                        </button>
                      ) : null}
                      {row.vehicle.active ? (
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: "retire", vehicle: row.vehicle })}
                          className="text-danger hover:underline"
                        >
                          Remove from service
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void run(() => getOps().setVehicleActive(row.vehicle.id, true))}
                          className="text-brand hover:text-brand-dark"
                        >
                          Return to service
                        </button>
                      )}
                      <Link
                        href={{ pathname: "/logs", query: { vehicle: row.vehicle.id } }}
                        className="text-ink-muted hover:text-ink"
                      >
                        Logs
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VehicleDialogs dialog={dialog} error={error} onClose={close} onRun={run} />
    </div>
  );
}

function VehicleDialogs({
  dialog,
  error,
  onClose,
  onRun,
}: {
  dialog: Dialog;
  error: string | null;
  onClose: () => void;
  onRun: (action: () => Promise<void>) => Promise<void>;
}) {
  return (
    <>
      <VehicleFormDialog
        open={dialog.kind === "add" || dialog.kind === "edit"}
        vehicle={dialog.kind === "edit" ? dialog.vehicle : null}
        error={error}
        onClose={onClose}
        onSubmit={(values) =>
          void onRun(() =>
            dialog.kind === "edit"
              ? getOps().updateVehicle(dialog.vehicle.id, values)
              : getOps().addVehicle({ ...values, active: true }),
          )
        }
      />

      <AbsenceDialog
        open={dialog.kind === "absent"}
        row={dialog.kind === "absent" ? dialog.row : null}
        error={error}
        onClose={onClose}
        onSubmit={(reason) =>
          void onRun(async () => {
            if (dialog.kind === "absent" && dialog.row.assignment) {
              await getOps().markAssignmentAbsent(dialog.row.assignment.id, reason);
            }
          })
        }
      />

      <RetireDialog
        open={dialog.kind === "retire"}
        vehicle={dialog.kind === "retire" ? dialog.vehicle : null}
        error={error}
        onClose={onClose}
        onSubmit={(reason) =>
          void onRun(async () => {
            if (dialog.kind === "retire") {
              await getOps().setVehicleActive(dialog.vehicle.id, false, reason);
            }
          })
        }
      />
    </>
  );
}

function VehicleFormDialog({
  open,
  vehicle,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  vehicle: Vehicle | null;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: { vehicleNumber: string; displayName: string; vehicleType: Vehicle["vehicleType"] }) => void;
}) {
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [vehicleType, setVehicleType] = useState<Vehicle["vehicleType"]>("COMPACTOR");
  const [touchedFor, setTouchedFor] = useState<string | null>(null);

  // Re-seed the form when a different vehicle is opened.
  const seedKey = vehicle?.id ?? "new";
  if (open && touchedFor !== seedKey) {
    setTouchedFor(seedKey);
    setVehicleNumber(vehicle?.vehicleNumber ?? "");
    setDisplayName(vehicle?.displayName ?? "");
    setVehicleType(vehicle?.vehicleType ?? "COMPACTOR");
  }
  if (!open && touchedFor !== null) setTouchedFor(null);

  const valid = /^[A-Za-z]{2,4}-?\d{2,4}$/.test(vehicleNumber.trim());

  return (
    <Modal open={open} title={vehicle ? "Edit vehicle" : "Add vehicle"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          onSubmit({ vehicleNumber, displayName: displayName.trim() || vehicleNumber, vehicleType });
        }}
        className="space-y-4"
      >
        <Field label="Vehicle number" hint="For example HSN-007.">
          <input
            value={vehicleNumber}
            onChange={(event) => setVehicleNumber(event.target.value.toUpperCase())}
            className="field"
            placeholder="HSN-007"
          />
        </Field>
        <Field label="Display name">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="field"
            placeholder="Compactor 7"
          />
        </Field>
        <Field label="Vehicle type">
          <select
            value={vehicleType}
            onChange={(event) => setVehicleType(event.target.value as Vehicle["vehicleType"])}
            className="field"
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </Field>

        <ErrorNote message={error} />

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={!valid} className="btn-primary">
            {vehicle ? "Save changes" : "Save vehicle"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const ABSENCE_REASONS = ["Vehicle maintenance", "Driver unavailable", "Vehicle breakdown", "Other"];

function AbsenceDialog({
  open,
  row,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  row: FleetRow | null;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState(ABSENCE_REASONS[0]!);
  const [other, setOther] = useState("");

  return (
    <Modal open={open} title="Mark vehicle absent today" onClose={onClose}>
      <p className="text-[14px] leading-relaxed text-ink-muted">
        {row
          ? `${row.vehicle.vehicleNumber} will be shown to residents of ${
              row.wards.map((w) => `Ward ${w.wardNumber}`).join(", ") || "this ward"
            } as unavailable for today. Any running session is ended.`
          : ""}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(reason === "Other" ? other.trim() || null : reason);
        }}
        className="mt-5 space-y-4"
      >
        <Field label="Reason (optional)">
          <select value={reason} onChange={(event) => setReason(event.target.value)} className="field">
            {ABSENCE_REASONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        {reason === "Other" ? (
          <Field label="Details">
            <input value={other} onChange={(event) => setOther(event.target.value)} className="field" />
          </Field>
        ) : null}

        <ErrorNote message={error} />

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn bg-warn text-white hover:opacity-90">
            Mark absent
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RetireDialog({
  open,
  vehicle,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  vehicle: Vehicle | null;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Modal open={open} title="Remove vehicle from service" onClose={onClose}>
      <p className="text-[14px] leading-relaxed text-ink-muted">
        {vehicle?.vehicleNumber} will no longer be available for new assignments. Existing records
        and logs are kept.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(reason.trim());
        }}
        className="mt-5 space-y-4"
      >
        <Field label="Reason">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="field"
            placeholder="Maintenance"
          />
        </Field>

        <ErrorNote message={error} />

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn bg-danger text-white hover:opacity-90">
            Remove from service
          </button>
        </div>
      </form>
    </Modal>
  );
}
