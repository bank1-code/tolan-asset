// Original quantity never changes; exclusion and warranty replacement are distinct exits.
export function remainingQuantity(row: {
  quantity: number;
  excludedQuantity?: number | null;
  warrantyReplacedQuantity?: number | null;
}) {
  return (
    row.quantity -
    (row.excludedQuantity || 0) -
    (row.warrantyReplacedQuantity || 0)
  );
}
