import { VNode } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import { utcDays } from "d3-time";
import { useQuery } from "preact-fetching";
import { format } from "d3-format";
import { group, ascending, max } from "d3-array";
import { scalePoint, scaleLinear, scaleOrdinal, NumberValue } from "d3-scale";
import { csvParse, autoType } from "d3-dsv";
import { line as d3Line } from "d3-shape";
import { select } from "d3-selection";
import { Axis as D3Axis, axisBottom, axisLeft } from "d3-axis";
import { schemeCategory10 } from "d3-scale-chromatic";
import Markdown from "preact-markdown";
import { path as reportPath } from "./report";
import { ReportFilterContext } from "./context/report-filter-context";
import Table, { TableData } from "./table";
import { AgenciesContext } from "./context/agencies-context";
import Accordion from "./accordion";
import useResizeListener from "./resize-listener";

enum FunnelMode {
  /**
   * Starts funnel at the welcome screen
   */
  OVERALL = "overall",
  /**
   * Starts funnel at the image submission screen
   */
  BLANKET = "blanket",
}

const DEFAULT_FUNNEL_MODE = FunnelMode.OVERALL;

enum Step {
  WELCOME = "welcome",
  AGREEMENT = "agreement",
  CAPTURE_DOCUMENT = "capture_document",
  CAP_DOC_SUBMIT = "cap_doc_submit",
  SSN = "ssn",
  VERIFY_INFO = "verify_info",
  VERIFY_SUBMIT = "verify_submit",
  PHONE = "phone",
  ENCRYPT = "encrypt",
  PERSONAL_KEY = "personal_key",
  VERIFIED = "verified",
}

const STEPS = [
  { key: Step.WELCOME, title: "Welcome" },
  { key: Step.AGREEMENT, title: "Agreement" },
  { key: Step.CAPTURE_DOCUMENT, title: "Capture Document" },
  { key: Step.CAP_DOC_SUBMIT, title: "Submit Document" },
  { key: Step.SSN, title: "SSN" },
  { key: Step.VERIFY_INFO, title: "Verify Info" },
  { key: Step.VERIFY_SUBMIT, title: "Verify Submit" },
  { key: Step.PHONE, title: "Phone" },
  { key: Step.ENCRYPT, title: "Encrypt" },
  { key: Step.PERSONAL_KEY, title: "Personal Key" },
  { key: Step.VERIFIED, title: "Verified" },
];

function stepToTitle(step: Step): string {
  return STEPS.find(({ key }) => key === step)?.title || "";
}

interface DailyDropoffsRow extends Record<Step, number> {
  issuer: string;
  // eslint-disable-next-line camelcase
  friendly_name: string;
  iaa: string;
  agency: string;
  start: Date;
  finish: Date;
}

const formatWithCommas = format(",");
const formatAsPercent = format(".0%");

function process(str: string): DailyDropoffsRow[] {
  return csvParse(str, autoType).map((parsedRow) => {
    const r = parsedRow as DailyDropoffsRow;
    return {
      ...r,
      issuer: r.issuer || "(No Issuer)",
      agency: r.agency || "(No Agency)",
      friendly_name: r.friendly_name || "(No App)",
    };
  });
}

function funnelSteps(funnelMode: FunnelMode) {
  return funnelMode === FunnelMode.OVERALL ? STEPS : STEPS.slice(3);
}

interface StepCount {
  step: Step;
  count: number;
  /**
   * compare to step[0]
   */
  percentOfFirst: number;
  /**
   * compare to step[n - 1]
   */
  percentOfPrevious: number;
}

function toStepCounts(row: DailyDropoffsRow, funnelMode: FunnelMode): StepCount[] {
  const steps = funnelSteps(funnelMode);

  const firstCount = row[steps[0].key] || 0;

  return steps.map(({ key }, idx) => {
    const count = row[key] || 0;
    const prevCount = idx > 0 ? row[steps[idx - 1].key] || 0 : firstCount;

    return {
      step: key,
      count,
      percentOfFirst: count / firstCount || 0, // guard against NaN from divide by zero
      percentOfPrevious: count / prevCount || 0,
    };
  });
}

/**
 * Sums up counts by day
 */
function aggregate(rows: DailyDropoffsRow[]): DailyDropoffsRow[] {
  return Array.from(group(rows, (d) => d.issuer))
    .sort(
      ([issuerA, binA], [issuerB, binB]) =>
        ascending(issuerA, issuerB) || ascending(binA[0].friendly_name, binB[0].friendly_name)
    )
    .map(([, bin]) => {
      const steps: Map<Step, number> = new Map();
      bin.forEach((row) => {
        STEPS.forEach(({ key }) => {
          const oldCount = steps.get(key) || 0;
          steps.set(key, (row[key] || 0) + oldCount);
        });
      });

      const { issuer, friendly_name: friendlyName, iaa, agency, start, finish } = bin[0];

      return {
        issuer,
        friendly_name: friendlyName,
        iaa,
        agency,
        start,
        finish,
        ...Object.fromEntries(steps),
      } as DailyDropoffsRow;
    });
}

function tabulate({
  rows: results,
  funnelMode,
  filterAgency,
  issuerColor,
}: {
  rows?: DailyDropoffsRow[];
  funnelMode: FunnelMode;
  filterAgency?: string;
  issuerColor: (issuer: string) => string;
}): TableData {
  const filteredRows = (results || []).filter((d) => !filterAgency || d.agency === filterAgency);

  const header = [
    "Agency",
    "App",
    ...funnelSteps(funnelMode).map(({ title }, idx) => (
      <th colSpan={idx === 0 ? 1 : 2}>{title}</th>
    )),
  ];

  const color = scaleLinear()
    .domain([1, 0])
    .range([
      // scaleLinear can interpolate string colors, but the 3rd party type annotations don't know that yet
      "steelblue" as unknown as number,
      "white" as unknown as number,
    ]);

  const body = filteredRows.map((row) => {
    const { agency, issuer, friendly_name: friendlyName } = row;

    return [
      agency,
      <span title={issuer}>
        <span style={`color: ${issuerColor(issuer)}`}>⬤ </span>
        {friendlyName}
      </span>,
      ...toStepCounts(row, funnelMode).flatMap(({ count, percentOfFirst }, idx) => {
        const backgroundColor = `background-color: ${color(percentOfFirst)};`;
        const cells = [
          <td className="table-number text-tabular text-right" style={backgroundColor}>
            {formatWithCommas(count)}
          </td>,
        ];

        if (idx > 0) {
          cells.push(
            <td className="table-number text-tabular text-right" style={backgroundColor}>
              {formatAsPercent(percentOfFirst)}
            </td>
          );
        }

        return cells;
      }),
    ];
  });

  return {
    header,
    body,
  };
}

function loadData(
  start: Date,
  finish: Date,
  env: string,
  fetch = window.fetch
): Promise<DailyDropoffsRow[]> {
  return Promise.all(
    utcDays(start, finish, 1).map((date) => {
      const path = reportPath({ reportName: "daily-dropoffs-report", date, env, extension: "csv" });
      return fetch(path).then((response) => response.text());
    })
  ).then((reports) => aggregate(reports.flatMap((r) => process(r))));
}

function Axis({
  axis,
  transform,
  rotateLabels,
  className,
}: {
  axis: D3Axis<NumberValue> | D3Axis<string>;
  transform: string;
  rotateLabels?: boolean;
  className?: string;
}): VNode {
  const ref = useRef(null as SVGGElement | null);

  useEffect(() => {
    if (ref.current) {
      select(ref.current).call(axis).classed("rotate-labels", !!rotateLabels);
    }
  }, [axis, rotateLabels]);

  return <g ref={ref} className={className} transform={transform} />;
}

function LineChart({
  data,
  funnelMode,
  color,
  width = 400,
  height = 400,
}: {
  data: DailyDropoffsRow[];
  funnelMode: FunnelMode;
  color: (issuer: string) => string;
  width?: number;
  height?: number;
}): VNode {
  const ref = useRef(null as SVGSVGElement | null);
  const [highlightedIssuer, setHighlightedIssuer] = useState(undefined as string | undefined);
  const highlightedRow = data.find(({ issuer }) => issuer === highlightedIssuer);

  const margin = {
    top: 30,
    right: 50,
    bottom: 50,
    left: 50,
  };

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const steps = funnelSteps(funnelMode);

  const x = scalePoint()
    .domain(steps.map(({ key }) => key))
    .range([0, innerWidth]);

  const y = scaleLinear()
    .domain([0, max(data || [], (d) => d[steps[0].key]) as number])
    .range([innerHeight, 0]);

  const line = d3Line()
    .x((d) => x((d as unknown as StepCount).step) as number)
    .y((d) => y((d as unknown as StepCount).count) as number) as (s: StepCount[]) => string;

  return (
    <svg
      ref={ref}
      height={height}
      width={width}
      onPointerLeave={() => setHighlightedIssuer(undefined)}
    >
      <Axis axis={axisLeft(y)} transform={`translate(${margin.left}, ${margin.top})`} />
      <Axis
        axis={axisBottom(x).tickFormat(stepToTitle as (s: string) => string)}
        transform={`translate(${margin.left}, ${margin.top + innerHeight})`}
        className="x-axis"
        rotateLabels={width < 700}
      />
      <text x={margin.left + innerWidth} y={margin.top} className="title" text-anchor="end">
        {highlightedRow?.friendly_name}
      </text>
      <g transform={`translate(${margin.left}, ${margin.top})`}>
        {(data || []).map((row) => (
          <path
            d={line(toStepCounts(row, funnelMode))}
            fill="none"
            stroke={color(row.issuer)}
            stroke-width="1"
            onPointerEnter={() => setHighlightedIssuer(row.issuer)}
          />
        ))}
      </g>
      <g transform={`translate(${margin.left}, ${margin.top})`}>
        {highlightedRow && (
          <g className="dots">
            {toStepCounts(highlightedRow, funnelMode).map(
              ({ step, count, percentOfFirst }, idx) => (
                <>
                  <circle cx={x(step)} cy={y(count)} r="3" fill={color(highlightedRow.issuer)} />
                  <text x={x(step)} y={y(count)} font-size="12" dx="3" dy="-3">
                    <tspan x={x(step)}>{formatWithCommas(count)}</tspan>
                    {idx > 0 && (
                      <tspan x={x(step)} dy="1.2em">
                        (${formatAsPercent(percentOfFirst)})
                      </tspan>
                    )}
                  </text>
                </>
              )
            )}
          </g>
        )}
      </g>
    </svg>
  );
}

function DailyDropffsReport(): VNode {
  const ref = useRef(null as HTMLDivElement | null);
  const [width, setWidth] = useState(undefined as number | undefined);
  const { setAgencies } = useContext(AgenciesContext);
  const { start, finish, agency, env, funnelMode } = useContext(ReportFilterContext);

  const { data } = useQuery(`dropoffs/${start.valueOf()}-${finish.valueOf()}`, () =>
    loadData(start, finish, env)
  );

  const issuerColor = scaleOrdinal(schemeCategory10);

  useEffect(() => {
    if (!data) {
      return;
    }

    const allAgencies = Array.from(new Set(data.map((d) => d.agency)))
      .filter((x) => !!x)
      .sort();

    setAgencies(allAgencies);
  }, [data]);

  useResizeListener(ref, () => setWidth(ref.current?.offsetWidth));

  return (
    <div ref={ref}>
      <Accordion id="how-is-it-measured" title="How is this measured?">
        <Markdown
          markdown={`
**Definitions**:

- *Blanket*: The funnel starts at the image submit step
- *Overall*: The funnel starts at the welcome step

**Timing**: All data is collected, grouped, and displayed in the UTC timezone.

**Known Limitations**:

The data model table can't accurately capture:
- Users who become verified on a different day than the day they start proofing (such as verify by mail)
- Users who attempt proofing at one partner app, and reattempt with a different partner app.
`}
        />
      </Accordion>
      <LineChart data={data || []} width={width} color={issuerColor} funnelMode={funnelMode} />
      <Table
        data={tabulate({ rows: data, filterAgency: agency, issuerColor, funnelMode })}
        numberFormatter={formatWithCommas}
      />
    </div>
  );
}

export default DailyDropffsReport;
export {
  Step,
  DailyDropoffsRow,
  FunnelMode,
  DEFAULT_FUNNEL_MODE,
  aggregate,
  tabulate,
  loadData,
  toStepCounts,
};
