// Unit tests for the seller options built from the product catalogue.
import { describe, expect, it } from 'vitest';

import { sellerOptionsFromProducts } from '../../src/client/lib/sellerOptions.js';

describe('sellerOptionsFromProducts', () => {
  it('returns an empty list when there are no products', () => {
    expect(sellerOptionsFromProducts([])).toEqual([]);
    expect(sellerOptionsFromProducts(undefined)).toEqual([]);
  });

  it('lists every shop that has a product', () => {
    const products = [
      { sellerId: 's2', sellerName: 'Beta', name: 'b' },
      { sellerId: 's1', sellerName: 'Alpha', name: 'a' },
    ];
    expect(sellerOptionsFromProducts(products)).toEqual([
      { id: 's1', name: 'Alpha' },
      { id: 's2', name: 'Beta' },
    ]);
  });

  it('deduplicates shops with several products', () => {
    const products = [
      { sellerId: 's1', sellerName: 'Alpha', name: 'a' },
      { sellerId: 's1', sellerName: 'Alpha', name: 'b' },
    ];
    expect(sellerOptionsFromProducts(products)).toEqual([{ id: 's1', name: 'Alpha' }]);
  });

  it('sorts the shops by name', () => {
    const products = [
      { sellerId: 's3', sellerName: 'Gamma' },
      { sellerId: 's1', sellerName: 'Alpha' },
      { sellerId: 's2', sellerName: 'Beta' },
    ];
    expect(sellerOptionsFromProducts(products).map((seller) => seller.name)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
  });

  it('ignores products without a seller', () => {
    const products = [{ sellerId: '', sellerName: 'Ghost' }, { sellerName: 'No id' }];
    expect(sellerOptionsFromProducts(products)).toEqual([]);
  });
});
