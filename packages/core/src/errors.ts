/**
 * Database errors, turned into sentences a person can act on.
 *
 * Nothing from PostgREST reaches a screen: "duplicate key value violates unique constraint
 * vehicles_number_key" is true, and useless. The constraint names below are the contract —
 * if a migration renames one, the message here stops matching and falls back to the generic
 * line rather than leaking the raw error.
 */

export type OperationErrorCode =
  | "CONFLICT"
  | "NOT_ALLOWED"
  | "NOT_FOUND"
  | "INVALID"
  | "NETWORK"
  | "AUTH"
  | "UNKNOWN";

export class OperationError extends Error {
  readonly code: OperationErrorCode;
  readonly cause?: unknown;

  constructor(message: string, code: OperationErrorCode = "UNKNOWN", cause?: unknown) {
    super(message);
    this.name = "OperationError";
    this.code = code;
    this.cause = cause;
  }
}

interface PostgrestLikeError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  vehicles_number_key: "This vehicle number is already registered.",
  workers_phone_key: "A worker with this mobile number already exists.",
  wards_area_id_ward_number_key: "This ward number already exists in that area.",
  assignments_one_per_route_day:
    "Assignment conflict: this route already has a vehicle for that day.",
  assignments_one_active_per_vehicle:
    "Assignment conflict: this vehicle is already running another route.",
  assignments_one_active_per_worker:
    "Assignment conflict: this worker is already running another route.",
  work_sessions_one_active_per_vehicle: "This vehicle already has a work session running.",
  work_sessions_one_active_per_worker: "This worker already has a work session running.",
  absence_is_consistent: "A vehicle marked absent cannot also be running its route.",
};

/** SQLSTATEs the database functions raise deliberately, with their intended meaning. */
const SQLSTATE_CODES: Record<string, OperationErrorCode> = {
  "23505": "CONFLICT", // unique_violation
  "23514": "INVALID", // check_violation
  "23503": "INVALID", // foreign_key_violation
  "42501": "NOT_ALLOWED", // insufficient_privilege
  "28000": "AUTH", // invalid_authorization_specification
  P0002: "NOT_FOUND", // no_data_found
  "22023": "INVALID", // invalid_parameter_value
  "22007": "INVALID", // invalid_datetime_format
  PGRST301: "AUTH", // JWT expired
};

export function translateError(error: unknown, fallback: string): OperationError {
  if (error instanceof OperationError) return error;

  const raw = (error ?? {}) as PostgrestLikeError;
  const text = `${raw.message ?? ""} ${raw.details ?? ""}`;

  for (const [constraint, message] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (text.includes(constraint)) return new OperationError(message, "CONFLICT", error);
  }

  const code = raw.code ? SQLSTATE_CODES[raw.code] : undefined;

  // Messages the database raised on purpose are already written for people, so they are
  // passed through; anything else is replaced, because it was written for a developer.
  if (code && code !== "CONFLICT" && raw.message && !raw.message.includes("violates")) {
    return new OperationError(raw.message, code, error);
  }
  if (raw.message === "Failed to fetch" || raw.message?.includes("NetworkError")) {
    return new OperationError(
      "We could not reach the server. Check your connection and try again.",
      "NETWORK",
      error,
    );
  }

  return new OperationError(fallback, code ?? "UNKNOWN", error);
}

/**
 * The message to show for a caught error.
 *
 * Both implementations raise their own error class, and a component should not have to know
 * which one it is talking to — it asks for the sentence and gets one it can display.
 */
export function messageFor(error: unknown, fallback: string): string {
  if (error instanceof OperationError) return error.message;
  if (error && typeof error === "object" && "name" in error) {
    const named = error as { name?: string; message?: string };
    if (named.name === "ServiceError" && named.message) return named.message;
    if (named.name === "ConflictError" && named.message) return named.message;
  }
  return fallback;
}
