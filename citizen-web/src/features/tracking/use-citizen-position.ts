"use client";

import { useCallback, useEffect, useState } from "react";
import type { LatLng } from "@/types/domain";

const CONSENT_KEY = "swachhata.location-consent";

type Permission = "unknown" | "granted" | "denied";

/**
 * Optional, opt-in. Distance to the vehicle is more useful from where the citizen
 * actually stands, but the app works fully without it and never asks on page load.
 */
export function useCitizenPosition() {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [permission, setPermission] = useState<Permission>("unknown");

  const request = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setPermission("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        window.localStorage.setItem(CONSENT_KEY, "granted");
        setPermission("granted");
        setPosition({ lat: coords.latitude, lng: coords.longitude });
      },
      () => {
        window.localStorage.removeItem(CONSENT_KEY);
        setPermission("denied");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  }, []);

  // Only re-ask automatically for someone who already said yes.
  useEffect(() => {
    if (window.localStorage.getItem(CONSENT_KEY) === "granted") request();
  }, [request]);

  return { position, permission, request };
}
