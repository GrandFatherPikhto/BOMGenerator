// Row-mode combobox of the purchase tables: "Все" shows every row, the other
// modes narrow the table to the positions that need attention.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LineFiltersBar, {
  EMPTY_LINE_FILTERS,
  ROW_MODES_WITHOUT_COMMON,
} from '../../src/client/components/LineFiltersBar.jsx';
import PurchaseBoardView from '../../src/client/components/PurchaseBoardView.jsx';

const board = { id: 'b1', name: 'Board', count: 1 };
const totals = { cost: 0, shippingCost: 0 };

function line(id, value, { notPurchased = false, common = false, productId = null } = {}) {
  return {
    id,
    reference: '',
    qty: 1,
    value,
    footprint: 'F',
    matchKey: id,
    productId,
    sellerId: productId ? 's1' : null,
    common,
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
  { kind: 'line', line: line('1', 'Bought', { productId: 'p1' }) },
  { kind: 'line', line: line('2', 'NoProduct') },
  { kind: 'line', line: line('3', 'Skipped', { notPurchased: true }) },
  { kind: 'line', line: line('4', 'Common', { common: true }) },
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

describe('Режимы строк', () => {
  it('«Все» показывает все строки, включая «Не закупается» и «Общие»', () => {
    render(view({ ...EMPTY_LINE_FILTERS }));

    expect(screen.getByText('Bought')).toBeTruthy();
    expect(screen.getByText('NoProduct')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
    expect(screen.getByText('Common')).toBeTruthy();
  });

  it('«Не закупается» оставляет только отмеченные строки', () => {
    render(view({ ...EMPTY_LINE_FILTERS, rowMode: 'notPurchased' }));

    expect(screen.getByText('Skipped')).toBeTruthy();
    expect(screen.queryByText('Bought')).toBeNull();
    expect(screen.queryByText('NoProduct')).toBeNull();
    expect(screen.queryByText('Common')).toBeNull();
  });

  it('«Не заполнено» оставляет только строки без товара', () => {
    render(view({ ...EMPTY_LINE_FILTERS, rowMode: 'unfilled' }));

    expect(screen.getByText('NoProduct')).toBeTruthy();
    expect(screen.queryByText('Bought')).toBeNull();
    expect(screen.queryByText('Skipped')).toBeNull();
    expect(screen.queryByText('Common')).toBeNull();
  });

  it('«Только общие» оставляет только строки «Общие»', () => {
    render(view({ ...EMPTY_LINE_FILTERS, rowMode: 'common' }));

    expect(screen.getByText('Common')).toBeTruthy();
    expect(screen.queryByText('Bought')).toBeNull();
    expect(screen.queryByText('NoProduct')).toBeNull();
    expect(screen.queryByText('Skipped')).toBeNull();
  });

  it('блокирует выбор продавца и товара у строки «Не закупается»', () => {
    render(view({ ...EMPTY_LINE_FILTERS, rowMode: 'notPurchased' }));

    const pickers = screen.getAllByPlaceholderText('—');
    expect(pickers.length).toBeGreaterThan(0);
    expect(pickers.every((element) => element.disabled)).toBe(true);
  });
});

describe('Комбобокс режимов', () => {
  it('предлагает «Только общие» там, где есть флаг «Общие»', () => {
    render(
      <LineFiltersBar
        rows={[]}
        filters={{ ...EMPTY_LINE_FILTERS }}
        onChange={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByLabelText('Строки'));
    expect(screen.getByRole('option', { name: 'Все' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Не закупается' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Не заполнено' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Только общие' })).toBeTruthy();
  });

  it('не предлагает «Только общие» на листах без этого флага', () => {
    render(
      <LineFiltersBar
        rows={[]}
        filters={{ ...EMPTY_LINE_FILTERS }}
        onChange={vi.fn()}
        rowModes={ROW_MODES_WITHOUT_COMMON}
      />,
    );

    fireEvent.mouseDown(screen.getByLabelText('Строки'));
    expect(screen.getByRole('option', { name: 'Не заполнено' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Только общие' })).toBeNull();
  });

  it('сообщает выбранный режим через onChange', () => {
    const onChange = vi.fn();
    render(
      <LineFiltersBar
        rows={[]}
        filters={{ ...EMPTY_LINE_FILTERS }}
        onChange={onChange}
      />,
    );

    fireEvent.mouseDown(screen.getByLabelText('Строки'));
    fireEvent.click(screen.getByRole('option', { name: 'Не заполнено' }));
    expect(onChange).toHaveBeenCalledWith({ rowMode: 'unfilled' });
  });
});
