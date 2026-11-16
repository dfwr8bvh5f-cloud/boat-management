import { describe, expect, it } from "vitest";
import { hoursUntilService, isServiceTrackedMachine, serviceStatus } from "./engine-service";

describe("serviceStatus", () => {
  it("is null well before the next 250h service", () => {
    expect(serviceStatus(100)).toBeNull();
    expect(serviceStatus(229.9)).toBeNull();
  });
  it("warns within 20 hours of the next multiple of 250", () => {
    expect(serviceStatus(230)).toEqual({ hoursRemaining: 20 });
    expect(serviceStatus(1480)).toEqual({ hoursRemaining: 20 });
    expect(serviceStatus(249)).toEqual({ hoursRemaining: 1 });
  });
  it("reports due now exactly on a multiple of 250", () => {
    expect(serviceStatus(500)).toEqual({ hoursRemaining: 0 });
  });
  it("ignores missing or invalid readings", () => {
    expect(serviceStatus(null)).toBeNull();
    expect(serviceStatus(undefined)).toBeNull();
    expect(serviceStatus(-5)).toBeNull();
  });
});

describe("isServiceTrackedMachine", () => {
  it("tracks engines (tender included) and generators, not gearboxes or watermakers", () => {
    expect(isServiceTrackedMachine("Main Engine 1")).toBe(true);
    expect(isServiceTrackedMachine("Generator 2")).toBe(true);
    expect(isServiceTrackedMachine("מנוע ימין")).toBe(true);
    expect(isServiceTrackedMachine("גנרטור")).toBe(true);
    expect(isServiceTrackedMachine("Tender engine")).toBe(true);
    expect(isServiceTrackedMachine("מנוע טנדר")).toBe(true);
    expect(isServiceTrackedMachine("Watermaker")).toBe(false);
    expect(isServiceTrackedMachine("Gearbox 1")).toBe(false);
  });
});

describe("hoursUntilService", () => {
  it("counts down to the next multiple of 250", () => {
    expect(hoursUntilService(0)).toBe(0);
    expect(hoursUntilService(100)).toBe(150);
    expect(hoursUntilService(1237.5)).toBe(12.5);
    expect(hoursUntilService(500)).toBe(0);
  });
  it("is null for missing or invalid readings", () => {
    expect(hoursUntilService(null)).toBeNull();
    expect(hoursUntilService(Number.NaN)).toBeNull();
  });
});
