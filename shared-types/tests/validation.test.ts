import {
  DESCRIPTION_MAX,
  PAUSE_MAX,
  PAUSE_MIN,
  SCRIPT_MAX_BYTES,
  SPEED_MAX,
  SPEED_MIN,
  TITLE_MAX,
} from "../src/validation";

describe("validation constants", () => {
  it("exports expected script-mode limits", () => {
    expect(SPEED_MIN).toBe(0.7);
    expect(SPEED_MAX).toBe(1.3);
    expect(PAUSE_MIN).toBe(0);
    expect(PAUSE_MAX).toBe(300);
    expect(TITLE_MAX).toBe(100);
    expect(DESCRIPTION_MAX).toBe(300);
    expect(SCRIPT_MAX_BYTES).toBe(20_000);
  });
});
