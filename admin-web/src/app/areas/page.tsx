"use client";

import { useState } from "react";
import { useStore } from "@/hooks/use-store";
import { store } from "@swachhata/core";
import { EmptyState, Field, Modal, PageHeader } from "@/components/ui";

export default function AreasPage() {
  const state = useStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Areas"
        description="Service areas within the municipal jurisdiction. Wards and routes sit inside an area."
        action={
          <button type="button" onClick={() => setAdding(true)} className="btn-primary">
            Add area
          </button>
        }
      />

      {state.areas.length === 0 ? (
        <EmptyState title="No areas added" description="Add a service area to begin creating wards." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.areas.map((area) => {
            const wards = state.wards.filter((ward) => ward.areaId === area.id);
            return (
              <article key={area.id} className="card p-5">
                <h2 className="text-[16px] font-semibold">{area.name}</h2>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {wards.length} {wards.length === 1 ? "ward" : "wards"}
                </p>
                <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
                  {wards.length > 0
                    ? wards
                        .sort((a, b) => a.wardNumber - b.wardNumber)
                        .map((ward) => `Ward ${ward.wardNumber}`)
                        .join(", ")
                    : "No wards yet."}
                </p>
              </article>
            );
          })}
        </div>
      )}

      <Modal open={adding} title="Add area" onClose={() => setAdding(false)}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            store.addArea({ name: name.trim(), jurisdictionId: "jur-hassan", status: "ACTIVE" });
            setName("");
            setAdding(false);
          }}
          className="space-y-4"
        >
          <Field label="Area name">
            <input value={name} onChange={(event) => setName(event.target.value)} className="field" />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={name.trim().length < 2} className="btn-primary">
              Save area
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
