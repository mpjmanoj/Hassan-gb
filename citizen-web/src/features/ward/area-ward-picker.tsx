"use client";

import { useEffect, useState } from "react";
import type { Area, Ward } from "@/types/domain";
import { getDataService } from "@/lib/data";

interface AreaWardPickerProps {
  areaId: string | null;
  wardId: string | null;
  onChange: (next: { areaId: string | null; wardId: string | null }) => void;
}

function Select({
  id,
  label,
  value,
  placeholder,
  disabled,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative mt-2">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="field appearance-none pr-11 disabled:bg-surface-muted disabled:text-ink-muted"
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted"
        >
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

/** Area first, then ward — changing the area always clears the ward beneath it. */
export function AreaWardPicker({ areaId, wardId, onChange }: AreaWardPickerProps) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [loadingWards, setLoadingWards] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getDataService()
      .listAreas()
      .then((result) => {
        if (!cancelled) setAreas(result);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!areaId) {
      setWards([]);
      return;
    }
    let cancelled = false;
    setLoadingWards(true);
    void getDataService()
      .listWards(areaId)
      .then((result) => {
        if (cancelled) return;
        setWards(result);
        setLoadingWards(false);
      });
    return () => {
      cancelled = true;
    };
  }, [areaId]);

  return (
    <div className="space-y-5">
      <Select
        id="area"
        label="Area"
        value={areaId ?? ""}
        placeholder="Select your area"
        options={areas.map((area) => ({ value: area.id, label: area.name }))}
        onChange={(value) => onChange({ areaId: value, wardId: null })}
      />
      <Select
        id="ward"
        label="Ward"
        value={wardId ?? ""}
        placeholder={areaId ? (loadingWards ? "Loading wards…" : "Select your ward") : "Select an area first"}
        disabled={!areaId || loadingWards}
        options={wards.map((ward) => ({
          value: ward.id,
          label: `Ward ${ward.wardNumber} · ${ward.name}`,
        }))}
        onChange={(value) => onChange({ areaId, wardId: value })}
      />
    </div>
  );
}
