import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MysBillingChip, type MysBilling } from "./mys-billing-chip";

const render = (billing: MysBilling, locale: "en" | "he" = "en") => renderToStaticMarkup(createElement(MysBillingChip, { billing, locale }));

describe("MysBillingChip", () => {
  it("marks an open debt in neutral blue-grey", () => {
    const html = render({ state: "open" });
    expect(html).toContain("Open debt");
    expect(html).toContain("text-fleet-navy");
    expect(html).not.toContain("title=");
  });

  it("treats an invoiced-but-unpaid charge as an open debt, with the invoice number in the tooltip", () => {
    const html = render({ state: "invoiced", invoiceNumber: "INV-0042" });
    expect(html).toContain("Open debt");
    expect(html).toContain('title="Invoiced INV-0042"');
  });

  it("draws nothing once the debt is paid", () => {
    expect(render({ state: "paid" })).toBe("");
  });

  it("is translated and never wraps", () => {
    const html = render({ state: "open" }, "he");
    expect(html).toContain("חוב פתוח");
    expect(html).toMatch(/shrink-0 whitespace-nowrap/);
  });
});
