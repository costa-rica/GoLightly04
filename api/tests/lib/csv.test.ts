import { parseCsv, toCsv } from "../../src/lib/csv";

describe("csv helpers", () => {
  it("round-trips quoted multiline text fields", () => {
    const rows = [
      {
        id: 1,
        title: "Morning",
        scriptSource: 'line one\nline two, with comma\nline three has "quotes"',
      },
    ];

    expect(parseCsv(toCsv(rows))).toEqual([
      {
        id: "1",
        title: "Morning",
        scriptSource: 'line one\nline two, with comma\nline three has "quotes"',
      },
    ]);
  });
});
