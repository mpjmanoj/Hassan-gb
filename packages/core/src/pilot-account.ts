/**
 * The fixed account the GPS pilot signs in with.
 *
 * Anonymous sign-in is a dashboard setting no API reaches, so the pilot cannot depend on
 * one being switched on. Email sign-in is on by default, so this account is the fallback.
 *
 * These credentials ship in the browser bundle and are therefore public. That is acceptable
 * for exactly what this account can do: it is linked to the test worker, so Row Level
 * Security confines it to the test vehicle on the test ward. It must be deleted before a
 * real ward is on the system.
 */
export const PILOT_ACCOUNT = {
  email: "pilot.driver@swachhata-hasan.app",
  password: "SwachhataPilot2026!",
} as const;
