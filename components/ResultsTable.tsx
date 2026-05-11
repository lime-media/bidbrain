"use client";

import { useState } from "react";

interface ResultsTableProps {
  data: Record<string, unknown>[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidColumn(col: string, data: Record<string, unknown>[]): boolean {
  // Hide a column if its name ends in _id (except quote_id) and its values look like UUIDs
  if (col === "quote_id") return false;
  if (!col.endsWith("_id") && col !== "id") return false;
  return data.slice(0, 3).some((row) => UUID_RE.test(String(row[col] ?? "")));
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value % 1 === 0 ? value.toString() : value.toFixed(2);
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function formatHeader(col: string): string {
  return col
    .replace(/_/g, " ")
    .replace(/\bid\b/gi, "ID")
    .replace(/\buom\b/gi, "UOM")
    .replace(/\bprice\b/gi, "Price")
    .replace(/\bqty\b/gi, "Qty")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ResultsTable({ data }: ResultsTableProps) {
  const [open, setOpen] = useState(false);

  if (!data || data.length === 0) return null;

  const allColumns = Object.keys(data[0]);
  const columns = allColumns.filter((col) => !isUuidColumn(col, data));

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {open ? "Hide" : "View"} source records ({data.length} row{data.length !== 1 ? "s" : ""})
      </button>

      {open && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 mt-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {columns.map((col) => (
                  <th key={col} className="px-3 py-2 font-medium whitespace-nowrap">
                    {formatHeader(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr
                  key={i}
                  className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  {columns.map((col) => (
                    <td key={col} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatCell(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
