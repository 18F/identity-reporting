import { expect } from "chai";
import { tabulate } from "./daily-auths-report";
import { html } from "htm/preact";
import { utcParse } from "d3-time-format";

describe("DailyAuthsReport", () => {
  describe("#tabulate", () => {
    const yearMonthDayParse = utcParse("%Y-%m-%d");

    const results =
      /** @type {import('./daily-auths-report').ProcessedResult[]} */
      ([
        {
          date: yearMonthDayParse("2021-01-01"),
          ial: 1,
          issuer: "issuer1",
          agency: "agency1",
          friendly_name: "app1",
          count: 100,
        },
        {
          date: yearMonthDayParse("2021-01-01"),
          ial: 2,
          issuer: "issuer1",
          agency: "agency1",
          friendly_name: "app1",
          count: 1,
        },
        {
          date: yearMonthDayParse("2021-01-01"),
          ial: 1,
          issuer: "issuer2",
          agency: "agency2",
          friendly_name: "app2",
          count: 1000,
        },
        {
          date: yearMonthDayParse("2021-01-02"),
          ial: 1,
          issuer: "issuer1",
          agency: "agency1",
          friendly_name: "app1",
          iaa: "iaa1",
          count: 111,
        },
      ]);

    /**
     * @param {import('./table').TableRow[]} body
     * @return {(string|number)[][]}
     * */
    function simplifyVNodes(body) {
      return body.map(([agency, issuerSpan, ...rest]) => [
        agency,
        /** @type import('preact').VNode */ (issuerSpan).props?.title,
        ...rest,
      ]);
    }

    it("builds a table by agency, issuer, ial", () => {
      const table = tabulate(results);

      expect(table.header).to.deep.eq(["Agency", "App", "IAL", "2021-01-01", "2021-01-02"]);
      expect(table.body).to.have.lengthOf(3);
      expect(simplifyVNodes(table.body)).to.deep.equal([
        ["agency1", "issuer1", "1", 100, 111],
        ["agency1", "issuer1", "2", 1, 0],
        ["agency2", "issuer2", "1", 1000, 0],
      ]);
    });

    it("filters by agency", () => {
      const table = tabulate(results, "agency1");

      expect(simplifyVNodes(table.body)).to.deep.equal([
        ["agency1", "issuer1", "1", 100, 111],
        ["agency1", "issuer1", "2", 1, 0],
      ]);
    });
    it("filters by ial", () => {
      const table = tabulate(results, undefined, 2);

      expect(simplifyVNodes(table.body)).to.deep.equal([["agency1", "issuer1", "2", 1]]);
    });
  });
});
