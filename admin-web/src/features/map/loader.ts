import { MAPS } from "@/lib/config";

let loading: Promise<typeof google.maps> | null = null;

/**
 * Loads the Maps JavaScript API exactly once per page.
 *
 * The key is a browser key restricted by HTTP referrer — it is public by design. Anything
 * secret stays on the server, and no routing calls are made from the live-tracking loop.
 */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser."));
  }
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  if (!MAPS.apiKey) return Promise.reject(new Error("NO_API_KEY"));

  loading = new Promise((resolve, reject) => {
    const callbackName = "__swachhataMapsReady";
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: MAPS.apiKey,
      v: "weekly",
      libraries: "marker",
      loading: "async",
      callback: callbackName,
    });

    (window as unknown as Record<string, unknown>)[callbackName] = () => {
      resolve(window.google.maps);
    };

    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error("MAPS_SCRIPT_FAILED"));
    };

    document.head.appendChild(script);
  });

  return loading;
}
