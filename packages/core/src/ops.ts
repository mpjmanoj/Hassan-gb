import type {
  Area,
  Route,
  Vehicle,
  Ward,
  Worker,
} from "./types";
import type { StoreState } from "./store";
import { store as demoStore } from "./store";

/**
 * What the operations dashboard is allowed to do, regardless of what is behind it.
 *
 * Every mutation is async because the real one is a network call. The demo store satisfies
 * the same interface so the screens do not care which is in use.
 */
export interface OpsStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): StoreState;
  getServerSnapshot(): StoreState;

  addVehicle(input: Omit<Vehicle, "id">): Promise<void>;
  updateVehicle(id: string, patch: Partial<Omit<Vehicle, "id">>): Promise<void>;
  setVehicleActive(id: string, active: boolean, reason?: string): Promise<void>;

  createAssignment(input: {
    routeId: string;
    wardId: string;
    vehicleId: string;
    workerId: string;
    assignmentDate: string;
  }): Promise<void>;
  markAssignmentAbsent(assignmentId: string, reason: string | null): Promise<void>;
  clearAbsence(assignmentId: string): Promise<void>;
  cancelAssignment(assignmentId: string): Promise<void>;

  addWorker(input: Omit<Worker, "id">): Promise<void>;
  setWorkerStatus(id: string, status: Worker["status"]): Promise<void>;
  addArea(input: Omit<Area, "id">): Promise<void>;
  addWard(input: Omit<Ward, "id">): Promise<void>;
  addRoute(input: Omit<Route, "id">): Promise<void>;

  endSession(sessionId: string): Promise<void>;
}

/** The in-browser store, given the async surface the dashboard now expects. */
export const demoOps: OpsStore = {
  subscribe: demoStore.subscribe,
  getSnapshot: demoStore.getSnapshot,
  getServerSnapshot: demoStore.getServerSnapshot,

  async addVehicle(input) {
    demoStore.addVehicle(input);
  },
  async updateVehicle(id, patch) {
    demoStore.updateVehicle(id, patch);
  },
  async setVehicleActive(id, active, reason) {
    demoStore.setVehicleActive(id, active, reason);
  },
  async createAssignment(input) {
    demoStore.createAssignment(input);
  },
  async markAssignmentAbsent(assignmentId, reason) {
    demoStore.markAssignmentAbsent(assignmentId, reason);
  },
  async clearAbsence(assignmentId) {
    demoStore.clearAbsence(assignmentId);
  },
  async cancelAssignment(assignmentId) {
    demoStore.cancelAssignment(assignmentId);
  },
  async addWorker(input) {
    demoStore.addWorker(input);
  },
  async setWorkerStatus(id, status) {
    demoStore.setWorkerStatus(id, status);
  },
  async addArea(input) {
    demoStore.addArea(input);
  },
  async addWard(input) {
    demoStore.addWard(input);
  },
  async addRoute(input) {
    demoStore.addRoute(input);
  },
  async endSession(sessionId) {
    demoStore.endSession(sessionId);
  },
};
