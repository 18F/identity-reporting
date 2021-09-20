import { expect } from "chai";
import { DEFAULT_ENV, DEFAULT_IAL, ReportFilterContext } from "./report-filter-context";
import { useContext } from "preact/hooks";
import { renderHook } from "@testing-library/preact-hooks";
import { VNode } from "preact";
import { JSDOM } from "jsdom";

describe("ReportFilterContext", () => {
  it("has expected default properties", () => {
    const { result } = renderHook(() => useContext(ReportFilterContext));

    expect(result.current?.ial).to.eq(DEFAULT_IAL);
    expect(result.current?.env).to.eq(DEFAULT_ENV);
  });
});