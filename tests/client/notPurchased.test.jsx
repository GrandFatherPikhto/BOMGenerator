// "Не закупается": the rows are hidden by default in the purchase table and
// shown again through the filter-bar toggle.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LineFiltersBar, {
  EMPTY_LINE_FILTERS,
} from '../../src/client/components/LineFiltersBar.jsx';
import PurchaseBoardView from '../../src/client/components/PurchaseBoardView.jsx';

const board = { id: 'b1', name: 'Board', count: 1 };
const totals = { cost: 0, shippingCost: 0 };

function line(id, value, notPurchased) {
  return {
    id,
    reference: '',
    qty: 1,
    value,
    footprint: 'F',
    matchKey: id,
    productId: null,
    sellerId: null,
    common: false,
    notPurchased,
    shippingCost: null,
    shippingOverride: null,
    description: '',
    totalQty: 1,
    purchaseQty: 1,
    packsOverride: null,
    packs: null,
    cost: null,
  };
}

const blocks = [
  { kind: 'category', name: 'Прочее' },
  { kind: 'line', line: line('1', 'Bought', false) },
  { kind: 'line', line: line('2', 'Skipped', true) },
];

function view(filters) {
  return (
    <PurchaseBoardView
      board={board}
      blocks={blocks}
      totals={totals}
      products={[]}
      onPatchLine={vi.fn()}
      filters={filters}
      onFiltersChange={vi.fn()}
      page={0}
      pageSize={20}
      onPageChange={vi.fn()}
      onPageSizeChange={vi.fn()}
    />
  );
}

describe('"Не закупается"', () => {
  it('hides the rows by default and shows them when the toggle is on', () => {
    const { rerender } = render(view({ ...EMPTY_LINE_FILTERS }));

    expect(screen.getByText('Bought')).toBeTruthy();
    expect(screen.queryByText('Skipped')).toBeNull();

    rerender(view({ ...EMPTY_LINE_FILTERS, showNotPurchased: true }));
    expect(screen.getByText('Skipped')).toBeTruthy();
  });

  it('the filter bar reports the toggle', () => {
    const onChange = vi.fn();
    render(
      <LineFiltersBar
        rows={[]}
        filters={{ ...EMPTY_LINE_FILTERS }}
        onChange={onChange}
        sellerOptions={[]}
      />,
    );

    fireEvent.click(screen.getByLabelText('Показывать не закупаемые'));
    expect(onChange).toHaveBeenCalledWith({ showNotPurchased: true });
  });
});
