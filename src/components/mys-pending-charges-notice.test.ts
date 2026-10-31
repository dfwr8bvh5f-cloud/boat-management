import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MysPendingChargesNotice, type PendingCharge } from "./mys-pending-charges-notice";

const row = (i: number, amount = 100): PendingCharge => ({ id: `r${i}`, boatName: `Boat ${i}`, description: `Part ${i}`, amount, date: "2026-10-05" });
const render = (rows: PendingCharge[], locale: "en" | "he" = "en") => renderToStaticMarkup(createElement(MysPendingChargesNotice, { rows, locale }));

describe("MysPendingChargesNotice", () => {
  it("renders nothing when there is nothing awaiting approval", () => {
    expect(render([])).toBe("");
  });

  it("shows the count, the combined amount, the rows and a link to approvals", () => {
    const html = render([row(1, 100), row(2, 250.5)]);
    expect(html).toContain("Awaiting approval - not billable yet (2)");
    expect(html).toContain("€350.5");
    expect(html).toContain("Boat 1");
    expect(html).toContain("05-10-2026");
    expect(html).toContain('href="/approvals"');
  });

  it("caps the list at 8 rows and says how many more there are", () => {
    const html = render(Array.from({ length: 11 }, (_, i) => row(i + 1)));
    expect(html).toContain("(11)");
    expect(html).toContain("Boat 8");
    expect(html).not.toContain("Boat 9");
    expect(html).toContain("+3 more");
  });

  it("is selectable-free: no checkbox or invoice action is offered for a pending row", () => {
    expect(render([row(1)])).not.toMatch(/checkbox|<button/);
  });

  it("uses the Hebrew copy for the he locale", () => {
    expect(render([row(1)], "he")).toContain("ממתין לאישור");
  });
});
