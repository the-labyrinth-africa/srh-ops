import { describe, it, expect } from "vitest";
import { canWrite, canRead, isAdmin, roleLabel } from "@/lib/permissions";

describe("Permissions Logic (lib/permissions.ts)", () => {
  describe("canWrite", () => {
    it("should allow write access for admin role", () => {
      expect(canWrite("admin")).toBe(true);
    });

    it("should allow write access for dispatcher role", () => {
      expect(canWrite("dispatcher")).toBe(true);
    });

    it("should deny write access for lecture role", () => {
      expect(canWrite("lecture")).toBe(false);
    });

    it("should deny write access for null or undefined roles", () => {
      expect(canWrite(null)).toBe(false);
      expect(canWrite(undefined)).toBe(false);
      expect(canWrite("unknown")).toBe(false);
    });
  });

  describe("canRead", () => {
    it("should allow read access for admin, dispatcher, and lecture roles", () => {
      expect(canRead("admin")).toBe(true);
      expect(canRead("dispatcher")).toBe(true);
      expect(canRead("lecture")).toBe(true);
    });

    it("should deny read access for invalid or missing roles", () => {
      expect(canRead(null)).toBe(false);
      expect(canRead(undefined)).toBe(false);
      expect(canRead("invalid_role")).toBe(false);
    });
  });

  describe("isAdmin", () => {
    it("should return true only for admin role", () => {
      expect(isAdmin("admin")).toBe(true);
      expect(isAdmin("dispatcher")).toBe(false);
      expect(isAdmin("lecture")).toBe(false);
      expect(isAdmin(null)).toBe(false);
    });
  });

  describe("roleLabel", () => {
    it("should return human readable French labels", () => {
      expect(roleLabel("admin")).toBe("Admin Ops");
      expect(roleLabel("dispatcher")).toBe("Dispatcher");
      expect(roleLabel("lecture")).toBe("Lecture seule");
      expect(roleLabel("unknown")).toBe("Utilisateur");
      expect(roleLabel(undefined)).toBe("Utilisateur");
    });
  });
});
