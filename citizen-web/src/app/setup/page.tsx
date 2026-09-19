"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/features/auth/auth-layout";
import { AreaWardPicker } from "@/features/ward/area-ward-picker";
import { useSession } from "@/features/auth/session-provider";

export default function SetupPage() {
  const router = useRouter();
  const { citizen, ready, update } = useSession();
  const [name, setName] = useState("");
  const [selection, setSelection] = useState<{ areaId: string | null; wardId: string | null }>({
    areaId: null,
    wardId: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !citizen) router.replace("/login");
  }, [ready, citizen, router]);

  useEffect(() => {
    if (!citizen) return;
    setName((current) => current || citizen.name);
    setSelection({ areaId: citizen.areaId, wardId: citizen.wardId });
  }, [citizen]);

  const complete = name.trim().length >= 2 && Boolean(selection.wardId);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!complete || saving) return;

    setSaving(true);
    setError(null);
    try {
      await update({ name: name.trim(), areaId: selection.areaId, wardId: selection.wardId });
      router.replace("/home");
    } catch {
      setError("We could not save your area right now. Please try again.");
      setSaving(false);
    }
  };

  if (!ready || !citizen) return null;

  return (
    <AuthLayout
      title="Set up your collection area"
      subtitle="We use this to show the vehicle that serves you. You can change it any time."
    >
      <form onSubmit={submit} className="flex flex-1 flex-col gap-5">
        <div>
          <label htmlFor="name" className="label">
            Your name
          </label>
          <input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            placeholder="Manoj M"
            className="field mt-2"
          />
        </div>

        <AreaWardPicker areaId={selection.areaId} wardId={selection.wardId} onChange={setSelection} />

        {error ? (
          <p role="alert" className="text-[13px] font-medium text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-auto pt-8">
          <button type="submit" disabled={!complete || saving} className="btn-primary w-full">
            {saving ? "Saving…" : "Continue"}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
