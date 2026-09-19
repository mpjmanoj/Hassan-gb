/**
 * The branded collection-vehicle marker: a truck seen from above, not a generic pin.
 * The SVG points north at heading 0 so the wrapper can rotate it by the GPS heading.
 */
export const TRUCK_SVG = `
<svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M11 6.5c0-1 .8-1.8 1.8-1.8h8.4c1 0 1.8.8 1.8 1.8v5.2h2.6c.9 0 1.7.6 1.9 1.5l1.3 5.4c.1.3.1.6.1.9v7.4c0 1-.8 1.8-1.8 1.8H6.9c-1 0-1.8-.8-1.8-1.8V6.5Z" fill="#087F5B"/>
  <path d="M23 12.2h2.6c.9 0 1.7.6 1.9 1.5l1.3 5.4H23v-6.9Z" fill="#064E3B"/>
  <rect x="8.6" y="8" width="11.6" height="5.4" rx="1" fill="#E7F5EF"/>
  <rect x="7.4" y="21.4" width="19.6" height="2.6" rx="1.3" fill="#064E3B"/>
  <circle cx="11.2" cy="27.2" r="2.8" fill="#10201A"/>
  <circle cx="23.4" cy="27.2" r="2.8" fill="#10201A"/>
  <circle cx="11.2" cy="27.2" r="1.1" fill="#C9D3CE"/>
  <circle cx="23.4" cy="27.2" r="1.1" fill="#C9D3CE"/>
</svg>`.trim();

/**
 * Builds the marker DOM: an outer node that carries the map position and a plate that is
 * rotated by heading. Keeping rotation on an inner node means the accuracy halo and the
 * label stay upright while the truck turns.
 */
export function createTruckMarkerElement(vehicleNumber: string): {
  root: HTMLDivElement;
  plate: HTMLDivElement;
  setLabelVisible: (visible: boolean) => void;
} {
  const root = document.createElement("div");
  root.className = "shv-marker";
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", `Collection vehicle ${vehicleNumber}`);

  const halo = document.createElement("span");
  halo.className = "shv-marker__halo";

  const plate = document.createElement("div");
  plate.className = "shv-marker__plate";
  plate.innerHTML = TRUCK_SVG;

  const label = document.createElement("span");
  label.className = "shv-marker__label";
  label.textContent = vehicleNumber;

  root.append(halo, plate, label);

  return {
    root,
    plate,
    setLabelVisible: (visible: boolean) => {
      label.style.opacity = visible ? "1" : "0";
      label.style.transform = visible ? "translateY(0)" : "translateY(-4px)";
    },
  };
}
