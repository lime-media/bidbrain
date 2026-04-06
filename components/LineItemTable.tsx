"use client";

interface LineItem {
  line_number: number;
  supplier_part_number: string | null;
  supplier_description: string;
  supplier_dimensions: string | null;
  category_code: string;
  lime_material_id: string | null;
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

export default function LineItemTable({ items, onChange }: LineItemTableProps) {
  const updateItem = (index: number, field: string, value: unknown) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    // Recalculate extended price when unit_price or quantity changes
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
      <p className="text-gray-500 text-sm italic py-4">
        No line items extracted
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500 text-xs uppercase tracking-wider">
            <th className="py-3 pr-3">#</th>
            <th className="py-3 pr-3">Description</th>
            <th className="py-3 pr-3">Category</th>
            <th className="py-3 pr-3">Material ID</th>
            <th className="py-3 pr-3">Confidence</th>
            <th className="py-3 pr-3 text-right">Unit Price</th>
            <th className="py-3 pr-3">UoM</th>
            <th className="py-3 pr-3 text-right">Qty</th>
            <th className="py-3 pr-3 text-right">Extended</th>
            <th className="py-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 pr-3 text-gray-400">{item.line_number}</td>
              <td className="py-2 pr-3 max-w-[250px]">
                <input
                  className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#94CE3C] focus:outline-none py-0.5"
                  value={item.supplier_description}
                  onChange={(e) =>
                    updateItem(i, "supplier_description", e.target.value)
                  }
                />
                {item.supplier_dimensions && (
                  <span className="text-xs text-gray-400 block">
                    {item.supplier_dimensions}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3">
                <select
                  className="bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#94CE3C] focus:outline-none text-sm"
                  value={item.category_code}
                  onChange={(e) =>
                    updateItem(i, "category_code", e.target.value)
                  }
                >
                  {[
                    "ALU",
                    "STL",
                    "LMB",
                    "ACR",
                    "SLT",
                    "TPE",
                    "FST",
                    "STG",
                    "ADH",
                    "FEE",
                    "OTH",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-2 pr-3">
                <input
                  className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#94CE3C] focus:outline-none py-0.5 text-xs font-mono"
                  value={item.lime_material_id || ""}
                  placeholder="—"
                  onChange={(e) =>
                    updateItem(
                      i,
                      "lime_material_id",
                      e.target.value || null
                    )
                  }
                />
                {item.match_candidates?.length > 0 && !item.lime_material_id && (
                  <div className="mt-1 space-x-1">
                    {item.match_candidates.map((c) => (
                      <button
                        key={c}
                        className="text-xs bg-gray-100 hover:bg-[#94CE3C]/20 px-1.5 py-0.5 rounded font-mono"
                        onClick={() =>
                          updateItem(i, "lime_material_id", c)
                        }
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </td>
              <td className="py-2 pr-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    confidenceColors[item.match_confidence] ||
                    confidenceColors.low
                  }`}
                >
                  {item.match_confidence}
                </span>
              </td>
              <td className="py-2 pr-3 text-right">
                <input
                  type="number"
                  step="0.01"
                  className="w-24 text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#94CE3C] focus:outline-none py-0.5"
                  value={item.unit_price}
                  onChange={(e) =>
                    updateItem(i, "unit_price", parseFloat(e.target.value) || 0)
                  }
                />
              </td>
              <td className="py-2 pr-3">
                <input
                  className="w-12 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#94CE3C] focus:outline-none py-0.5 text-xs"
                  value={item.price_uom}
                  onChange={(e) =>
                    updateItem(i, "price_uom", e.target.value)
                  }
                />
              </td>
              <td className="py-2 pr-3 text-right">
                <input
                  type="number"
                  className="w-16 text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#94CE3C] focus:outline-none py-0.5"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(
                      i,
                      "quantity",
                      parseInt(e.target.value) || 0
                    )
                  }
                />
              </td>
              <td className="py-2 pr-3 text-right font-medium">
                ${item.extended_price?.toFixed(2) || "0.00"}
              </td>
              <td className="py-2">
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
            <td colSpan={8} className="py-3 text-right pr-3">
              Total:
            </td>
            <td className="py-3 text-right">
              $
              {items
                .reduce((sum, item) => sum + (item.extended_price || 0), 0)
                .toFixed(2)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
