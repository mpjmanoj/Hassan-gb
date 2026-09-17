import type {
  Area,
  Assignment,
  Jurisdiction,
  Route,
  Vehicle,
  Ward,
  WorkSession,
  Worker,
} from "./types";
import { todayIso } from "./time";

/**
 * Development fixtures only.
 *
 * Every row here mirrors what the municipality will own in Postgres. Nothing in this file
 * is used when NEXT_PUBLIC_DATA_SOURCE=supabase.
 */

export const jurisdictions: Jurisdiction[] = [
  { id: "jur-hassan", name: "Hassan City Municipal Council", status: "ACTIVE" },
];

export const areas: Area[] = [
  { id: "area-hassan-city", jurisdictionId: "jur-hassan", name: "Hassan City", status: "ACTIVE" },
  { id: "area-shanthigrama", jurisdictionId: "jur-hassan", name: "Shanthigrama", status: "ACTIVE" },
];

export const wards: Ward[] = [
  { id: "ward-1", areaId: "area-hassan-city", wardNumber: 1, name: "Pension Mohalla", status: "ACTIVE" },
  { id: "ward-2", areaId: "area-hassan-city", wardNumber: 2, name: "Hemavathi Nagar", status: "ACTIVE" },
  { id: "ward-3", areaId: "area-hassan-city", wardNumber: 3, name: "Vidyanagar", status: "ACTIVE" },
  { id: "ward-4", areaId: "area-hassan-city", wardNumber: 4, name: "Sathyamangala", status: "ACTIVE" },
  { id: "ward-5", areaId: "area-hassan-city", wardNumber: 5, name: "Kuvempunagar", status: "ACTIVE" },
  { id: "ward-6", areaId: "area-hassan-city", wardNumber: 6, name: "Salagame Road", status: "ACTIVE" },
  { id: "ward-7", areaId: "area-hassan-city", wardNumber: 7, name: "Bengaluru Road", status: "ACTIVE" },
  { id: "ward-8", areaId: "area-hassan-city", wardNumber: 8, name: "Rajendra Nagar", status: "ACTIVE" },
  { id: "ward-s1", areaId: "area-shanthigrama", wardNumber: 1, name: "Shanthigrama Main", status: "ACTIVE" },
];

/** Hand-traced service loops around Hassan. Real geometry will come from route mapping. */
export const routes: Route[] = [
  {
    id: "route-1",
    wardId: "ward-1",
    routeName: "Ward 1 Main Route",
    status: "ACTIVE",
    routeGeometry: [
      { lat: 13.0121, lng: 76.0934 },
      { lat: 13.0136, lng: 76.0975 },
      { lat: 13.0112, lng: 76.1005 },
      { lat: 13.0083, lng: 76.0988 },
      { lat: 13.0092, lng: 76.0944 },
      { lat: 13.0121, lng: 76.0934 },
    ],
  },
  {
    id: "route-2",
    wardId: "ward-2",
    routeName: "Ward 2 Main Route",
    status: "ACTIVE",
    routeGeometry: [
      { lat: 13.0035, lng: 76.0891 },
      { lat: 13.0064, lng: 76.0912 },
      { lat: 13.0058, lng: 76.0958 },
      { lat: 13.0021, lng: 76.0946 },
      { lat: 13.0035, lng: 76.0891 },
    ],
  },
  {
    id: "route-3",
    wardId: "ward-3",
    routeName: "Vidyanagar Circuit",
    status: "ACTIVE",
    routeGeometry: [
      { lat: 13.0009, lng: 76.1024 },
      { lat: 13.0041, lng: 76.1048 },
      { lat: 13.0035, lng: 76.1092 },
      { lat: 12.9996, lng: 76.1077 },
      { lat: 13.0009, lng: 76.1024 },
    ],
  },
  {
    id: "route-4",
    wardId: "ward-4",
    routeName: "Sathyamangala Link",
    status: "ACTIVE",
    routeGeometry: [
      { lat: 12.9962, lng: 76.0968 },
      { lat: 12.9989, lng: 76.1001 },
      { lat: 12.9971, lng: 76.1039 },
      { lat: 12.9938, lng: 76.1012 },
      { lat: 12.9962, lng: 76.0968 },
    ],
  },
  {
    id: "route-5",
    wardId: "ward-5",
    routeName: "Kuvempunagar Main Route",
    status: "ACTIVE",
    routeGeometry: [
      { lat: 13.0062, lng: 76.1023 },
      { lat: 13.0089, lng: 76.1046 },
      { lat: 13.0104, lng: 76.1089 },
      { lat: 13.0071, lng: 76.1112 },
      { lat: 13.0041, lng: 76.1081 },
      { lat: 13.0048, lng: 76.1039 },
      { lat: 13.0062, lng: 76.1023 },
    ],
  },
  {
    id: "route-6",
    wardId: "ward-6",
    routeName: "Salagame Road Route",
    status: "ACTIVE",
    routeGeometry: [
      { lat: 13.0148, lng: 76.1052 },
      { lat: 13.0171, lng: 76.1088 },
      { lat: 13.0142, lng: 76.1121 },
      { lat: 13.0118, lng: 76.1084 },
      { lat: 13.0148, lng: 76.1052 },
    ],
  },
  {
    id: "route-7",
    wardId: "ward-7",
    routeName: "Bengaluru Road Route",
    status: "ACTIVE",
    routeGeometry: [
      { lat: 12.9931, lng: 76.1108 },
      { lat: 12.9968, lng: 76.1142 },
      { lat: 12.9942, lng: 76.1181 },
      { lat: 12.9908, lng: 76.1146 },
      { lat: 12.9931, lng: 76.1108 },
    ],
  },
];

export const vehicles: Vehicle[] = [
  { id: "veh-1", vehicleNumber: "HSN-001", displayName: "Compactor 1", vehicleType: "COMPACTOR", active: true },
  { id: "veh-2", vehicleNumber: "HSN-002", displayName: "Compactor 2", vehicleType: "COMPACTOR", active: true },
  { id: "veh-3", vehicleNumber: "HSN-003", displayName: "Tipper 3", vehicleType: "TIPPER", active: true },
  { id: "veh-4", vehicleNumber: "HSN-004", displayName: "Tipper 4", vehicleType: "TIPPER", active: true },
  { id: "veh-5", vehicleNumber: "HSN-005", displayName: "Auto Tipper 5", vehicleType: "AUTO_TIPPER", active: true },
  { id: "veh-6", vehicleNumber: "HSN-006", displayName: "Auto Tipper 6", vehicleType: "AUTO_TIPPER", active: false },
];

export const workers: Worker[] = [
  { id: "wkr-1", name: "Ramesh", phone: "9008800101", status: "ACTIVE" },
  { id: "wkr-2", name: "Suresh", phone: "9008800102", status: "ACTIVE" },
  { id: "wkr-3", name: "Ravi", phone: "9008800103", status: "ACTIVE" },
  { id: "wkr-4", name: "Kumar", phone: "9008800104", status: "ACTIVE" },
];

const today = todayIso();

/**
 * Assignments are per operating day — a ward is never hard-wired to a vehicle.
 * HSN-003 covers wards 3 to 6 today, which is exactly the fan-out the citizen never sees.
 */
export const assignments: Assignment[] = [
  mkAssignment("asg-1", "route-1", "ward-1", "veh-1", "wkr-1", "ACTIVE"),
  mkAssignment("asg-2", "route-2", "ward-2", "veh-2", "wkr-2", "ACTIVE"),
  mkAssignment("asg-3", "route-3", "ward-3", "veh-3", "wkr-3", "COMPLETED"),
  mkAssignment("asg-4", "route-4", "ward-4", "veh-3", "wkr-3", "SCHEDULED"),
  mkAssignment("asg-5", "route-5", "ward-5", "veh-3", "wkr-3", "ACTIVE"),
  mkAssignment("asg-6", "route-6", "ward-6", "veh-5", "wkr-4", "COMPLETED"),
  { ...mkAssignment("asg-7", "route-7", "ward-7", "veh-4", "wkr-4", "ABSENT"), isAbsent: true, absenceReason: "Vehicle maintenance" },
  // Ward 8 has no assignment today, so the citizen there sees the no-route empty state.
];

function mkAssignment(
  id: string,
  routeId: string,
  wardId: string,
  vehicleId: string,
  workerId: string,
  status: Assignment["status"],
): Assignment {
  return {
    id,
    routeId,
    wardId,
    vehicleId,
    workerId,
    assignmentDate: today,
    status,
    isAbsent: false,
    absenceReason: null,
  };
}

const at = (hour: number, minute: number) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

export const workSessions: WorkSession[] = [
  { id: "ses-1", assignmentId: "asg-1", vehicleId: "veh-1", workerId: "wkr-1", routeId: "route-1", startedAt: at(8, 12), endedAt: null, status: "ACTIVE" },
  { id: "ses-2", assignmentId: "asg-2", vehicleId: "veh-2", workerId: "wkr-2", routeId: "route-2", startedAt: at(8, 5), endedAt: null, status: "ACTIVE" },
  // HSN-003 covers wards 3 to 6, but only ever one route at a time: ward 3 is finished,
  // ward 5 is running now, ward 4 has not started.
  { id: "ses-3", assignmentId: "asg-3", vehicleId: "veh-3", workerId: "wkr-3", routeId: "route-3", startedAt: at(7, 10), endedAt: at(8, 20), status: "COMPLETED" },
  { id: "ses-5", assignmentId: "asg-5", vehicleId: "veh-3", workerId: "wkr-3", routeId: "route-5", startedAt: at(8, 32), endedAt: null, status: "ACTIVE" },
  { id: "ses-6", assignmentId: "asg-6", vehicleId: "veh-5", workerId: "wkr-4", routeId: "route-6", startedAt: at(6, 40), endedAt: at(9, 15), status: "COMPLETED" },
];

/**
 * Municipality-supplied figures. In production these arrive from the admin import
 * (daily collection summary) — they are never computed in the browser.
 */
export interface DailySummary {
  date: string;
  collectedKg: number;
  disposedKg: number;
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return todayIso(d);
};

export const dailySummaries: DailySummary[] = [
  { date: today, collectedKg: 1284, disposedKg: 1210 },
  { date: daysAgo(1), collectedKg: 1341, disposedKg: 1288 },
  { date: daysAgo(2), collectedKg: 1195, disposedKg: 1142 },
  { date: daysAgo(3), collectedKg: 1402, disposedKg: 1330 },
  { date: daysAgo(4), collectedKg: 1268, disposedKg: 1201 },
  { date: daysAgo(5), collectedKg: 1310, disposedKg: 1255 },
  { date: daysAgo(6), collectedKg: 1156, disposedKg: 1098 },
];

export const activeCitizenCount = 2486;

/** Household-level records. Stage 2/3 data — empty until the collection pipeline exists. */
export const householdCollections: { date: string; quantityKg: number; collectedAt: string }[] = [];
