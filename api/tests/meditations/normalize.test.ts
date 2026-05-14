import { AppError } from "../../src/lib/errors";
import {
  normalizePauseDuration,
  normalizeSpeed,
} from "../../src/services/meditations/normalize";

describe("meditation job input normalization", () => {
  describe("normalizeSpeed", () => {
    it("returns undefined for empty values", () => {
      expect(normalizeSpeed(undefined)).toBeUndefined();
      expect(normalizeSpeed("")).toBeUndefined();
    });

    it("parses string and number inputs", () => {
      expect(normalizeSpeed("1.0")).toBe(1.0);
      expect(normalizeSpeed(1.0)).toBe(1.0);
    });

    it("rejects invalid numbers", () => {
      expect(() => normalizeSpeed("abc")).toThrow(AppError);
      expect(() => normalizeSpeed("0.6")).toThrow(AppError);
      expect(() => normalizeSpeed("1.4")).toThrow(AppError);
    });
  });

  describe("normalizePauseDuration", () => {
    it("returns undefined for empty values", () => {
      expect(normalizePauseDuration(undefined)).toBeUndefined();
      expect(normalizePauseDuration("")).toBeUndefined();
    });

    it("parses string and number inputs", () => {
      expect(normalizePauseDuration("1.0")).toBe(1.0);
      expect(normalizePauseDuration(1.0)).toBe(1.0);
    });

    it("rejects invalid numbers", () => {
      expect(() => normalizePauseDuration("abc")).toThrow(AppError);
      expect(() => normalizePauseDuration("0")).toThrow(AppError);
      expect(() => normalizePauseDuration("301")).toThrow(AppError);
    });
  });
});
