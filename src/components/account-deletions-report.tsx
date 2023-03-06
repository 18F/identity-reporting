import { useContext, useRef } from "preact/hooks";
import { ascending, flatGroup } from "d3-array";
import { format } from "d3-format";
import * as Plot from "@observablehq/plot";
import useRegistrationData from "../hooks/use-registration-data";
import useElementWidth from "../hooks/use-element-width";
import { ReportFilterContext } from "../contexts/report-filter-context";
import { yearMonthDayFormat } from "../formats";
import PlotComponent from "./plot";
import Table from "./table";
import type { ProcessedResult } from "../models/daily-registrations-report-data";
import type { TableData } from "./table";

interface ProcessedFormattedData {
  date: Date;
  value: number;
}

function plot({ data, width }: { data: ProcessedFormattedData[]; width?: number }): HTMLElement {
  return Plot.plot({
    color: {
      type: "ordinal",
      scheme: "Tableau10",
    },
    marks: [Plot.ruleY([0]), Plot.line(data, { x: "date", y: "value" })],
    width,
    y: {
      domain: [0, 0.1],
    },
  });
}

function tabulate(results: ProcessedFormattedData[]): TableData {
  return {
    header: ["Date", "Percent"],
    body: results
      .sort(({ date: aDate }, { date: bDate }) => ascending(aDate, bDate))
      .map(({ date, value }) => [yearMonthDayFormat(date), value]),
  };
}

function getStartOfWeek(date: Date) {
  const day = date.getDay();
  const offset = date.getDate() - day;
  const startOfWeek = new Date(date);
  startOfWeek.setDate(offset);
  return startOfWeek;
}

function formatData(data: ProcessedResult[]): ProcessedFormattedData[] {
  return flatGroup(data, (value) => getStartOfWeek(value.date)).flatMap(([week, entries]) => {
    const { deletedUsers, fullyRegisteredUsers } = entries.reduce(
      (result, entry) => {
        result.deletedUsers += entry.deletedUsers;
        result.fullyRegisteredUsers += entry.fullyRegisteredUsers;
        return result;
      },
      { deletedUsers: 0, fullyRegisteredUsers: 0 }
    );
    const value = deletedUsers / fullyRegisteredUsers;

    return { date: week, value };
  });
}

function AccountDeletionsReport() {
  const { start, finish } = useContext(ReportFilterContext);
  const ref = useRef<HTMLDivElement>(null);
  const data = useRegistrationData({ start, finish });
  const width = useElementWidth(ref);

  const formattedData = formatData(data || []);

  return (
    <div ref={ref}>
      <PlotComponent plotter={() => plot({ data: formattedData, width })} inputs={[data, width]} />
      <Table numberFormatter={format(".2%")} data={tabulate(formattedData)} />
    </div>
  );
}

export default AccountDeletionsReport;