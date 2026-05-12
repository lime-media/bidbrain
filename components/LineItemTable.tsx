"use client";

import { useRef, useState } from "react";

interface LineItem {
  line_number: number;
  supplier_part_number: string | null;
  supplier_description: string;
  supplier_dimensions: string | null;
  category_code: string;
  lime_material_id: string | null;
  is_new_material?: boolean;
  suggested_lime_material_id?: string | null;
  match_candidates: string[];
  match_confidence: "high" | "medium" | "low";
  unit_price: number;
  price_uom: string;
  quantity: number;
  extended_price: number;
  shipping_cost: number | null;
  break_qty: number | null;
  break_price: number | null;
  lead_time_days: number | null;
  notes: string | null;
}

interface LineItemTableProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
}

const confidenceColors = {
  high: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-red-100 text-red-800",
};

const COLS = ["#", "Description", "Category", "Material ID", "Confidence", "Unit Price", "UoM", "Qty", "Extended", ""] as const;
const INITIAL_WIDTHS: Record<string, number> = {
  "#": 40,
  "Description": 240,
  "Category": 90,
  "Material ID": 160,
  "Confidence": 90,
  "Unit Price": 100,
  "UoM": 60,
  "Qty": 70,
  "Extended": 100,
  "": 36,
};

export default function LineItemTable({ items, onChange }: LineItemTableProps) {
  const [colWidths, setColWidths] = useState<Record<string, number>>({ ...INITIAL_WIDTHS });
  const dragRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

  const handleMouseDown = (col: string, e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { col, startX: e.clientX, startWidth: colWidths[col] };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      const newWidth = Math.max(40, dragRef.current.startWidth + delta);
      setColWidths((prev) => ({ ...prev, [dragRef.current!.col]: newWidth }));
    };

    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const updateItem = (index: number, field: string, value: unknown) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "unit_price" || field === "quantity") {
      updated[index].extended_price =
        Number(updated[index].unit_price) * Number(updated[index].quantity);
    }
    onChange(updated);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  if (items.length === 0) {
    return (
      <p className="text-gray-500 text-sm italic py-4">No line items extracted</p>
    );
  }

  const totalWidth = COLS.reduce((sum, col) => sum + colWidths[col], 0);

  return (
    <div className="overflow-x-auto">
      <table
        className="text-sm border-collapse"
        style={{ tableLayout: "fixed", width: totalWidth, minWidth: "100%" }}
      >
        <colgroup>
          {COLS.map((col) => (
            <col key={col} style={{ width: colWidths[col] }} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500 text-xs uppercase tracking-wider">
            {COLS.map((col) => (
              <th
                key={col}
                className="py-3 pr-2 font-semibold"
                style={{ position: "relative", userSelect: "none", overflow: "hidden" }}
              >
                {col}
                {col !== "" && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 5,
                      cursor: "col-resize",
                      zIndex: 1,
                    }}
                    onMouseDown={(e) => handleMouseDown(col, e)}
                    className="hover:bg-[#94CE3C]/40"
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr
              key={i}
              className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <td className="py-2 pr-2 text-gray-400 overflow-hidden">{item.line_number}</td>
              <td className="py-2 pr-2 overflow-hidden">
                <input
                  className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#94CE3C] focus:outline-none py-0.5"
                  value={item.supplier_description}
                  onChange={(e) => updateItem(i, "supplier_description", e.target.value)}
                />
                {item.supplier_dimensions && (
                  <span className="text-xs text-gray-400 block truncate">{item.supplier_dimensions}</span>
                )}
              </td>
              <td className="py-2 pr-2 overflow-hidden">
                <select
                  className="bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#94CE3C] focus:outline-none text-sm w-full"
                  value={item.category_code}
                  onChange={(e) => updateItem(i, "category_code", e.target.value)}
                >
                  {["ALU","STL","LMB","ACR","SLT","TPE","FST","STG","ADH","FOM","FEE","OTH"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </td>
              <td className="py-2 pr-2 overflow-hidden">
                <div className="flex items-center gap-1">
                  <input
                    className="flex-1 min-w-0 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#94CE3C] focus:outline-none py-0.5 text-xs font-mono"
                    value={item.is_new_material ? (item.suggested_lime_material_id || "") : (item.lime_material_id || "")}
                    placeholder="—"
                    onChange={(e) =>
                      updateItem(i, item.is_new_material ? "suggested_lime_material_id" : "lime_material_id", e.target.value || null)
                    }
                  />
                  {item.is_new_material && (
                    <span className="shrink-0 text-xs bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-medium">NEW</span>
                  )}
                </div>
                {item.match_candidates?.length > 0 && !item.lime_material_id && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.match_candidates.map((c) => (
                      <button
                        key={c}
                        className="text-xs bg-gray-100 dark:bg-gray-700 dark:text-gray-200 hover:bg-[#94CE3C]/20 px-1.5 py-0.5 rounded font-mono"
                        onClick={() => {
                          updateItem(i, "lime_material_id", c);
                          updateItem(i, "is_new_material", false);
                          updateItem(i, "suggested_lime_material_id", null);
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </td>
              <td className="py-2 pr-2 overflow-hidden">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${confidenceColors[item.match_confidence] || confidenceColors.low}`}>
                  {item.match_confidence}
                </span>
              </td>
              <td className="py-2 pr-2 overflow-hidden">
                <input
                  type="number"
                  step="0.01"
                  className="w-full text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#94CE3C] focus:outline-none py-0.5"
                  value={item.unit_price}
                  onChange={(e) => updateItem(i, "unit_price", parseFloat(e.target.value) || 0)}
                />
              </td>
              <td className="py-2 pr-2 overflow-hidden">
                <input
                  className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#94CE3C] focus:outline-none py-0.5 text-xs"
                  value={item.price_uom}
                  onChange={(e) => updateItem(i, "price_uom", e.target.value)}
                />
              </td>
              <td className="py-2 pr-2 overflow-hidden">
                <input
                  type="number"
                  className="w-full text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#94CE3C] focus:outline-none py-0.5"
                  value={item.quantity}
                  onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 0)}
                />
              </td>
              <td className="py-2 pr-2 text-right font-medium overflow-hidden">
                ${item.extended_price?.toFixed(2) || "0.00"}
              </td>
              <td className="py-2 overflow-hidden">
                <button
                  onClick={() => removeItem(i)}
                  className="text-gray-400 hover:text-red-500 text-lg leading-none"
                  title="Remove line item"
                >
                  &times;
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td colSpan={8} className="py-3 text-right pr-2">Total:</td>
            <td className="py-3 text-right">
              ${items.reduce((sum, item) => sum + (item.extended_price || 0), 0).toFixed(2)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
