// The product picker dialog: default columns, the single search and the
// "Итого" calculation for the current line quantity.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ProductPickerDialog from '../../src/client/components/ProductPickerDialog.jsx';

const PRODUCTS = [
  {
    id: 'p1',
    sellerId: 's1',
    sellerName: 'ChipDip',
    sellerUrl: '',
    name: 'Resistor 0402 8.2',
    url: 'https://chipdip.example/p1',
    packQty: 1000,
    packPrice: 1200,
    shippingCost: 300,
    category: 'Resistors',
    footprint: '0402',
    description: 'SMD 1%',
  },
  {
    id: 'p2',
    sellerId: 's2',
    sellerName: 'AliExpress',
    sellerUrl: '',
    name: 'Resistor 0402 8.2',
    url: '',
    packQty: 100,
    packPrice: 150,
    shippingCost: 350,
    category: 'Resistors',
    footprint: '0402',
    description: 'долго едет',
  },
];

const ROW = { value: 'Resistor 0402 8.2', footprint: '0402', totalQty: 340 };

// ru-RU groups thousands with a non-breaking space; compare without whitespace.
const bare = (text) => String(text).replace(/\s/g, '');
const money = (value) => (content) => bare(content) === bare(value);

function renderDialog(props = {}) {
  const onClose = vi.fn();
  const onSelect = vi.fn();
  render(
    <ProductPickerDialog
      open
      onClose={onClose}
      row={ROW}
      products={PRODUCTS}
      selectedId={null}
      onSelect={onSelect}
      {...props}
    />,
  );
  return { onClose, onSelect };
}

describe('ProductPickerDialog', () => {
  it('shows the line context and the default columns', () => {
    renderDialog();

    expect(screen.getByText('Выбор товара')).toBeInTheDocument();
    expect(screen.getByText(/Нужно 340 шт/)).toBeInTheDocument();
    // Default columns are present.
    expect(screen.getByText('Магазин')).toBeInTheDocument();
    expect(screen.getByText('В упак.')).toBeInTheDocument();
    expect(screen.getByText('Описание')).toBeInTheDocument();
    expect(screen.getByText('Footprint')).toBeInTheDocument();
  });

  it('computes Итого for the current quantity and shows the pack count', () => {
    renderDialog();

    // p1: 1 pack (ceil(340 / 1000)) * 1200 + 300 = 1500; p2: 4 * 150 + 350 = 950.
    expect(screen.getByText(money('1 500,00'))).toBeInTheDocument();
    expect(screen.getByText(money('950,00'))).toBeInTheDocument();
    expect(screen.getByText('1 уп')).toBeInTheDocument();
    expect(screen.getByText('4 уп')).toBeInTheDocument();
  });

  it('filters rows with the single search across text fields', () => {
    renderDialog();

    fireEvent.change(
      screen.getByLabelText(/Поиск по магазину, названию, категории/),
      { target: { value: 'AliExpress' } },
    );

    expect(screen.queryByText('ChipDip')).not.toBeInTheDocument();
    expect(screen.getByText('AliExpress')).toBeInTheDocument();
  });

  it('reports the chosen product and closes the dialog', () => {
    const { onClose, onSelect } = renderDialog();

    fireEvent.click(screen.getAllByLabelText('Выбрать этот товар')[0]);

    expect(onSelect).toHaveBeenCalledWith('p1');
    expect(onClose).toHaveBeenCalled();
  });

  it('enables Очистить only when something is selected and clears the row', () => {
    const { onClose, onSelect } = renderDialog({ selectedId: 'p2' });

    const clear = screen.getByRole('button', { name: 'Очистить' });
    fireEvent.click(clear);

    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps Очистить disabled without a selected product', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Очистить' })).toBeDisabled();
  });
});
