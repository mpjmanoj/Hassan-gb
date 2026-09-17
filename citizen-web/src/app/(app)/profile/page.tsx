"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Area, Ward } from "@swachhata/core";
import { useSession } from "@/features/auth/session-provider";
import { AreaWardPicker } from "@/features/ward/area-ward-picker";
import { getDataService } from "@swachhata/core";
import { Wordmark } from "@/components/logo";

export default function ProfilePage() {
  const router = useRouter();
  const { citizen, signOut, update } = useSession();
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState({
    areaId: citizen?.areaId ?? null,
    wardId: citizen?.wardId ?? null,
  });
  const [area, setArea] = useState<Area | null>(null);
  const [ward, setWard] = useState<Ward | null>(null);
  const [saving, setSaving] = useState(false);

  // Resolve the saved ids to names for display.
  useEffect(() => {
    if (!citizen?.areaId || !citizen.wardId) return;
    let cancelled = false;
    const service = getDataService();

    void Promise.all([service.listAreas(), service.listWards(citizen.areaId)]).then(
      ([areas, wards]) => {
        if (cancelled) return;
        setArea(areas.find((a) => a.id === citizen.areaId) ?? null);
        setWard(wards.find((w) => w.id === citizen.wardId) ?? null);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [citizen?.areaId, citizen?.wardId]);

  if (!citizen) return null;

  const save = async () => {
    if (!selection.wardId || saving) return;
    setSaving(true);
    await update({ areaId: selection.areaId, wardId: selection.wardId });
    setSaving(false);
    setEditing(false);
  };

  return (
    <main className="px-4 pt-6">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight">Profile</h1>

      <section className="card mt-6 p-5">
        <p className="text-[18px] font-semibold">{citizen.name || "Resident"}</p>
        <p className="mt-1 text-[14px] text-ink-muted">+91 {citizen.phone}</p>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
          <div>
            <dt className="label">Area</dt>
            <dd className="mt-1 text-[15px] font-semibold">{area?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="label">Ward</dt>
            <dd className="mt-1 text-[15px] font-semibold">
              {ward ? `Ward ${ward.wardNumber} · ${ward.name}` : "—"}
            </dd>
          </div>
        </dl>

        {editing ? (
          <div className="mt-6 border-t border-line pt-5">
            <AreaWardPicker
              areaId={selection.areaId}
              wardId={selection.wardId}
              onChange={setSelection}
            />
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={save}
                disabled={!selection.wardId || saving}
                className="btn-primary flex-1"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelection({ areaId: citizen.areaId, wardId: citizen.wardId });
                  setEditing(false);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="btn-secondary mt-5 w-full">
            Change area / ward
          </button>
        )}
      </section>

      <section className="card mt-4 divide-y divide-line">
        <details className="group px-5 py-4">
          <summary className="cursor-pointer list-none text-[15px] font-semibold marker:hidden">
            Help
          </summary>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            If your vehicle does not appear, the crew may not have started the route yet. Status
            here always reflects what the municipality has recorded — we never show a vehicle as
            live without a recent location.
          </p>
        </details>
        <details className="group px-5 py-4">
          <summary className="cursor-pointer list-none text-[15px] font-semibold marker:hidden">
            About Swachhata Hasan
          </summary>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            A live tracking platform for waste collection in Hassan, built so residents know when
            their collection vehicle is on the way.
          </p>
        </details>
      </section>

      <button
        type="button"
        onClick={() => {
          signOut();
          router.replace("/");
        }}
        className="btn-secondary mt-4 w-full text-danger"
      >
        Log out
      </button>

      <div className="mt-8 flex justify-center pb-4 opacity-60">
        <Wordmark />
      </div>
    </main>
  );
}
