import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MysBillingChip, type MysBilling } from "./mys-billing-chip";

const render = (billing: MysBilling, locale: "en" | "he" = "en") => renderToStaticMarkup(createElement(MysBillingChip, { billing, locale }));

describe("MysBillingChip", () => {
  it("shows an open debt in brass", () => {
    const html = render({ state: "open" });
    expect(html).toContain("Open debt");
    expect(html).toContain("text-fleet-brass");
  });

  it("shows the invoice number once billed, in navy", () => {
    const html = render({ state: "invoiced", invoiceNumber: "INV-0042" });
    expect(html).toContain("Invoiced INV-0042");
    expect(html).toContain("text-fleet-navy");
  });

  it("omits the number cleanly when the invoice has none", () => {
    expect(render({ state: "invoiced", invoiceNumber: null })).toContain(">Invoiced<");
  });

  it("shows paid in moss, and is translated", () => {
    expect(render({ state: "paid" })).toContain("text-fleet-moss-text");
    expect(render({ state: "paid" }, "he")).toContain("שולם");
  });

  it("never wraps: the chip is nowrap and non-shrinking so a single-line row stays single-line", () => {
    expect(render({ state: "open" })).toMatch(/shrink-0 whitespace-nowrap/);
  });
});
