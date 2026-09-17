"use client";

import { useState } from "react";
import { useStore } from "@/hooks/use-store";
import { ConflictError, store } from "@/lib/store";
import { EmptyState, ErrorNote, Field, Modal, PageHeader } from "@/components/ui";

export default function WardsPage() {
  const state = useStore();
  const [dialog, setDialog] = useState<"none" | "ward" | "route">("none");
  const [error, setError] = useState<string | null>(null);

  const [areaId, setAreaId] = useState(state.areas[0]?.id ?? "");
  const [wardNumber, setWardNumber] = useState("");
  const [wardName, setWardName] = useState("");
  const [routeWardId, setRouteWardId] = useState("");
  const [routeName, setRouteName] = useState("");

  const close = () => {
    setDialog("none");
    setError(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wards & routes"
        description="Collection routes belong to a ward. Route geometry can be added later without changing assignments."
        action={
          <div className="flex gap-3">
            <button type="button" onClick={() => setDialog("route")} className="btn-secondary">
              Add route
            </button>
            <button type="button" onClick={() => setDialog("ward")} className="btn-primary">
              Add ward
            </button>
          </div>
        }
      />

      {state.wards.length === 0 ? (
        <EmptyState title="No wards added" description="Add a ward to start creating collection routes." />
      ) : (
        <div className="space-y-6">
          {state.areas.map((area) => {
            const wards = state.wards
              .filter((ward) => ward.areaId === area.id)
              .sort((a, b) => a.wardNumber - b.wardNumber);
            if (wards.length === 0) return null;

            return (
              <section key={area.id}>
                <h2 className="mb-3 text-[15px] font-semibold">{area.name}</h2>
                <div className="card divide-y divide-line">
                  {wards.map((ward) => {
                    const routes = state.routes.filter((route) => route.wardId === ward.id);
                    return (
                      <div key={ward.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                        <div>
                          <p className="text-[14px] font-semibold">
                            Ward {ward.wardNumber} · {ward.name}
                          </p>
                          <p className="mt-1 text-[13px] text-ink-muted">
                            {routes.length > 0
                              ? routes.map((route) => route.routeName).join(" · ")
                              : "No routes configured"}
                          </p>
                        </div>
                        <p className="text-[12px] text-ink-muted">
                          {routes.filter((r) => r.routeGeometry.length > 1).length} of {routes.length}{" "}
                          routes mapped
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal open={dialog === "ward"} title="Add ward" onClose={close}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            try {
              store.addWard({
                areaId,
                wardNumber: Number(wardNumber),
                name: wardName.trim(),
                status: "ACTIVE",
              });
              setWardNumber("");
              setWardName("");
              close();
            } catch (caught) {
              setError(caught instanceof ConflictError ? caught.message : "We could not add that ward.");
            }
          }}
          className="space-y-4"
        >
          <Field label="Area">
            <select value={areaId} onChange={(event) => setAreaId(event.target.value)} className="field">
              {state.areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ward number">
              <input
                value={wardNumber}
                onChange={(event) => setWardNumber(event.target.value.replace(/\D/g, "").slice(0, 3))}
                inputMode="numeric"
                className="field"
              />
            </Field>
            <Field label="Ward name">
              <input value={wardName} onChange={(event) => setWardName(event.target.value)} className="field" />
            </Field>
          </div>
          <ErrorNote message={error} />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={close} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={!wardNumber || wardName.trim().length < 2} className="btn-primary">
              Save ward
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog === "route"} title="Add route" onClose={close}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            store.addRoute({
              wardId: routeWardId,
              routeName: routeName.trim(),
              routeGeometry: [],
              status: "ACTIVE",
            });
            setRouteName("");
            close();
          }}
          className="space-y-4"
        >
          <Field label="Ward">
            <select
              value={routeWardId}
              onChange={(event) => setRouteWardId(event.target.value)}
              className="field"
            >
              <option value="">Select ward</option>
              {state.wards.map((ward) => (
                <option key={ward.id} value={ward.id}>
                  Ward {ward.wardNumber} · {ward.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Route name"
            hint="Route geometry is added separately once the path has been mapped."
          >
            <input value={routeName} onChange={(event) => setRouteName(event.target.value)} className="field" />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={close} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={!routeWardId || routeName.trim().length < 3} className="btn-primary">
              Save route
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
