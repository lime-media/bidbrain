"use client";

interface ResultsTableProps {
  data: Record<string, unknown>[];
}

export default function ResultsTable({ data }: ResultsTableProps) {
  if (!data || data.length === 0) return null;

  const columns = Object.keys(data[0]);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 my-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-left text-gray-500 uppercase tracking-wider">
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 font-medium">
                {col.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
              {columns.map((col) => (
                <td key={col} className="px-3 py-1.5 text-gray-700">
                  {formatCell(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return value % 1 === 0 ? value.toString() : value.toFixed(2);
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
