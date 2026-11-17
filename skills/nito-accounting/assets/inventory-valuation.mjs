// Inventory cost per item and location: moving average or FIFO (IAS 2.25; for
// tax only average or FIFO per secondary sources, see
// references/inventory-assets-cash.md). The stock module owns quantities; this
// gives it the cost of each issue, which it sends as the amount of sale_cogs,
// stock_issue or stock_transfer_out. test/accounting.mjs ties the moving
// average to worked entry I1.
//
// Quantities are decimal strings with up to 4 places, money as everywhere
// else. `decimals` is the precision costs are rounded to: 2 keeps cents, 0
// rounds to whole rupiah as I1 does. Rounding is half up and the remainder
// stays in the stock value, so value on hand never drifts from the ledger.
import { toMinor, fromMinor } from "./posting-core.mjs";

const QS = 4n;
function qty(v) {
  if (typeof v !== "string" || !/^\d+(\.\d{1,4})?$/.test(v)) throw new RangeError(`quantity must be a decimal string with up to 4 places: ${v}`);
  const [i, f = ""] = v.split(".");
  return BigInt(i) * 10n ** QS + BigInt((f + "0000").slice(0, 4));
}
const qstr = (q) => { const s = q.toString().padStart(5, "0"); return `${s.slice(0, -4)}.${s.slice(-4)}`.replace(/\.?0+$/, "") || "0"; };

export function createValuation(method = "moving_average", { decimals = 2 } = {}) {
  if (!["moving_average", "fifo"].includes(method)) throw new Error(`unknown method ${method}`);
  const unit = 10n ** BigInt(2 - decimals);                 // minor units per rounding step
  // half up straight to the rounding step; rounding to cents first and then
  // cutting to rupiah would turn 454,666.8 into 454,666
  const round = (num, den) => ((num * 2n + den * unit) / (den * unit * 2n)) * unit;
  let onHand = 0n, value = 0n;
  const layers = [];                                       // FIFO: { q, v }

  return {
    // a receipt at total cost (unit cost x qty, landed costs included)
    receive(quantity, totalCost) {
      const q = qty(quantity), v = toMinor(totalCost);
      if (q <= 0n) throw new RangeError("receipt quantity must be above zero");
      onHand += q; value += v;
      if (method === "fifo") layers.push({ q, v });
      return this.position();
    },
    // an issue: returns the cost to post
    issue(quantity) {
      let q = qty(quantity);
      if (q <= 0n) throw new RangeError("issue quantity must be above zero");
      if (q > onHand) throw new RangeError(`issue of ${quantity} exceeds ${qstr(onHand)} on hand`);
      let cost = 0n;
      if (method === "moving_average") {
        cost = q === onHand ? value : round(value * q, onHand);
      } else {
        while (q > 0n) {
          const l = layers[0], take = q < l.q ? q : l.q;
          const part = take === l.q ? l.v : round(l.v * take, l.q);
          cost += part; l.q -= take; l.v -= part; q -= take;
          if (l.q === 0n) layers.shift();
        }
        q = qty(quantity);
      }
      onHand -= q; value -= cost;
      return fromMinor(cost);
    },
    position() {
      return { on_hand: qstr(onHand), value: fromMinor(value),
        // shown to the cent whatever `decimals` is, as I1 quotes 10,666.67
        unit_cost: onHand === 0n ? "0.00" : fromMinor((value * 10n ** QS * 2n + onHand) / (onHand * 2n)) };
    },
  };
}
