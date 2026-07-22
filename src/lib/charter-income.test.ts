import { describe, expect, it } from "vitest";
import { parseCharterText } from "./charter-income";

describe("parseCharterText", () => {
  it("extracts every field from a full real-world pasted confirmation", () => {
    const text = [
      "CHARTER CODE 2600704",
      "Yacht: M/C SAMARA",
      "Dates: 06/07/2026 (12.00) to 13/07/2026 (12.00)",
      "Base: Athens to Athens",
      "Gross price EURO 70000 + VAT + APA",
      "Price Net to you: EURO 56000 + VAT",
    ].join("\n");

    expect(parseCharterText(text)).toEqual({
      charter_code: "2600704",
      start_date: "2026-07-06",
      end_date: "2026-07-13",
      embarkation_port: "Athens",
      disembarkation_port: "Athens",
      gross_price: 70000,
      net_price_to_owner: 56000,
    });
  });

  it("handles a colon after the label and a dash date separator", () => {
    const text = [
      "Charter code: 2700141",
      "Yacht: S/Y LULU",
      "Dates: 02/10/2027 (12.00) - 09/10/2027 (12.00)",
      "Base: Corfu to Kefalonia",
      "Gross price EURO 22,000 + VAT + APA",
    ].join("\n");

    const result = parseCharterText(text);
    expect(result.charter_code).toBe("2700141");
    expect(result.start_date).toBe("2027-10-02");
    expect(result.end_date).toBe("2027-10-09");
    expect(result.embarkation_port).toBe("Corfu");
    expect(result.disembarkation_port).toBe("Kefalonia");
    expect(result.gross_price).toBe(22000);
    expect(result.net_price_to_owner).toBeNull();
  });

  it("leaves every field null for unrelated free text", () => {
    expect(parseCharterText("just a random note, no charter data here")).toEqual({
      charter_code: null,
      start_date: null,
      end_date: null,
      embarkation_port: null,
      disembarkation_port: null,
      gross_price: null,
      net_price_to_owner: null,
    });
  });
});
