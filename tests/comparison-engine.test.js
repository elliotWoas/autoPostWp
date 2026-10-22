import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  reconcileInventories,
  normalizeSku,
  isTehranJanebiAvailable,
  isTehranJanebiOutOfStock,
} from '../src/core/comparison-engine.js';

describe('Inventory Comparison Engine', () => {
  // Test 1: Matching SKUs with available stock
  it('1. should match out-of-stock KianSmart products available on TehranJanebi with stock quantity', () => {
    const kianSmart = [
      { id: 101, name: 'Smart Watch X', sku: 'SKU-WATCH-01', stock_status: 'outofstock', permalink: 'https://kiansmart.ir/p/101' },
      { id: 102, name: 'USB-C Cable', sku: 'SKU-CBL-02', stock_status: 'outofstock', permalink: 'https://kiansmart.ir/p/102' },
    ];

    const tehranJanebi = [
      { id: 901, name: 'Smart Watch X Wholesale', sku: 'SKU-WATCH-01', stock_status: 'instock', stock_quantity: 15, url: 'https://tehranjanebi.com/p/901' },
      { id: 902, name: 'USB-C Cable Wholesale', sku: 'SKU-CBL-02', stock_status: 'instock', stock_quantity: 50, url: 'https://tehranjanebi.com/p/902' },
    ];

    const result = reconcileInventories({
      kianSmartProducts: kianSmart,
      tehranJanebiProducts: tehranJanebi,
    });

    assert.strictEqual(result.summary.opportunitiesCount, 2);
    assert.strictEqual(result.opportunities.length, 2);
    assert.strictEqual(result.opportunities[0].sku, 'SKU-WATCH-01');
    assert.strictEqual(result.opportunities[0].tehranJanebiQuantity, 15);
    assert.strictEqual(result.opportunities[0].tehranJanebiUrl, 'https://tehranjanebi.com/p/901');
  });

  // Test 2: Products unavailable on both sites
  it('2. should classify products as unavailableOnBoth when both are out of stock', () => {
    const kianSmart = [
      { id: 103, name: 'Power Bank 20000', sku: 'SKU-PB-20K', stock_status: 'outofstock' },
    ];

    const tehranJanebi = [
      { id: 903, name: 'Power Bank 20000 Wholesale', sku: 'SKU-PB-20K', stock_status: 'outofstock', stock_quantity: 0, url: 'https://tehranjanebi.com/p/903' },
    ];

    const result = reconcileInventories({
      kianSmartProducts: kianSmart,
      tehranJanebiProducts: tehranJanebi,
    });

    assert.strictEqual(result.summary.opportunitiesCount, 0);
    assert.strictEqual(result.summary.unavailableOnBothCount, 1);
    assert.strictEqual(result.unavailableOnBoth[0].sku, 'SKU-PB-20K');
  });

  // Test 3: SKUs missing from TehranJanebi
  it('3. should classify products missing from TehranJanebi under missingOnTehranJanebi', () => {
    const kianSmart = [
      { id: 104, name: 'Unique KianSmart Gadget', sku: 'SKU-UNIQUE-99', stock_status: 'outofstock' },
    ];

    const tehranJanebi = [
      { id: 904, name: 'Other Gadget', sku: 'SKU-OTHER-01', stock_status: 'instock', stock_quantity: 5 },
    ];

    const result = reconcileInventories({
      kianSmartProducts: kianSmart,
      tehranJanebiProducts: tehranJanebi,
    });

    assert.strictEqual(result.summary.opportunitiesCount, 0);
    assert.strictEqual(result.summary.missingOnTehranJanebiCount, 1);
    assert.strictEqual(result.missingOnTehranJanebi[0].sku, 'SKU-UNIQUE-99');
  });

  // Test 4: Duplicate SKU records
  it('4. should identify duplicate SKUs on either platform and record them safely', () => {
    const kianSmart = [
      { id: 105, name: 'Earphones Pro (Black)', sku: 'SKU-EAR-PRO', stock_status: 'outofstock' },
      { id: 106, name: 'Earphones Pro (Duplicate)', sku: 'SKU-EAR-PRO', stock_status: 'outofstock' },
    ];

    const tehranJanebi = [
      { id: 905, name: 'Earphones Pro TJ 1', sku: 'SKU-EAR-PRO', stock_status: 'instock', stock_quantity: 10 },
      { id: 906, name: 'Earphones Pro TJ 2', sku: 'SKU-EAR-PRO', stock_status: 'instock', stock_quantity: 12 },
    ];

    const result = reconcileInventories({
      kianSmartProducts: kianSmart,
      tehranJanebiProducts: tehranJanebi,
    });

    assert.strictEqual(result.summary.duplicateSkusCount, 2);
    assert.strictEqual(result.duplicates.length, 2);
    // Opportunities should still include the matched item without crashing
    assert.strictEqual(result.summary.opportunitiesCount, 2);
  });

  // Test 5: Missing stock quantities (explicit status available, quantity null)
  it('5. should display available items with null quantities without assuming zero', () => {
    const kianSmart = [
      { id: 107, name: 'Bluetooth Speaker', sku: 'SKU-SPK-01', stock_status: 'outofstock' },
    ];

    const tehranJanebi = [
      { id: 907, name: 'Bluetooth Speaker', sku: 'SKU-SPK-01', stock_status: 'instock', stock_quantity: null },
    ];

    const result = reconcileInventories({
      kianSmartProducts: kianSmart,
      tehranJanebiProducts: tehranJanebi,
    });

    assert.strictEqual(result.summary.opportunitiesCount, 1);
    assert.strictEqual(result.opportunities[0].tehranJanebiQuantity, null);
    assert.strictEqual(result.opportunities[0].tehranJanebiAvailable, true);
  });

  // Test 8: Empty product lists
  it('8. should handle empty product lists gracefully without error', () => {
    const result = reconcileInventories({
      kianSmartProducts: [],
      tehranJanebiProducts: [],
    });

    assert.strictEqual(result.summary.totalKianSmartOutOfStock, 0);
    assert.strictEqual(result.summary.totalTehranJanebiProducts, 0);
    assert.strictEqual(result.summary.opportunitiesCount, 0);
    assert.strictEqual(result.opportunities.length, 0);
  });

  // Test 9: Product variations & SKU whitespace normalization
  it('9. should match product variations and normalize harmless surrounding whitespace without stripping leading zeroes', () => {
    const kianSmart = [
      {
        id: 201,
        parentId: 200,
        name: 'Phone Case - Red',
        sku: '  00789-RED  ',
        stock_status: 'outofstock',
        type: 'variation',
        permalink: 'https://kiansmart.ir/case/?var=red',
      },
    ];

    const tehranJanebi = [
      {
        id: 950,
        name: 'Phone Case Red Wholesale',
        sku: '00789-RED',
        stock_status: 'instock',
        stock_quantity: 25,
        url: 'https://tehranjanebi.com/case-red',
      },
    ];

    const result = reconcileInventories({
      kianSmartProducts: kianSmart,
      tehranJanebiProducts: tehranJanebi,
    });

    assert.strictEqual(result.summary.opportunitiesCount, 1);
    assert.strictEqual(result.opportunities[0].sku, '00789-RED');
    assert.strictEqual(result.opportunities[0].tehranJanebiQuantity, 25);
  });

  // Test: Unmatched / empty SKUs
  it('should report items missing SKUs under unmatchedRecords separately', () => {
    const kianSmart = [
      { id: 301, name: 'No SKU Item 1', sku: '', stock_status: 'outofstock' },
      { id: 302, name: 'No SKU Item 2', sku: null, stock_status: 'outofstock' },
    ];

    const tehranJanebi = [
      { id: 980, name: 'TJ No SKU', sku: '', stock_status: 'instock' },
    ];

    const result = reconcileInventories({
      kianSmartProducts: kianSmart,
      tehranJanebiProducts: tehranJanebi,
    });

    assert.strictEqual(result.summary.unmatchedMissingSkuCount, 3);
    assert.strictEqual(result.summary.opportunitiesCount, 0);
  });

  // Test: Unknown stock status
  it('should categorize ambiguous stock status under unknownStatus', () => {
    const kianSmart = [
      { id: 401, name: 'Special Item', sku: 'SKU-UNKNOWN', stock_status: 'outofstock' },
    ];

    const tehranJanebi = [
      { id: 991, name: 'Special Item TJ', sku: 'SKU-UNKNOWN', stock_status: 'unknown', stock_quantity: null },
    ];

    const result = reconcileInventories({
      kianSmartProducts: kianSmart,
      tehranJanebiProducts: tehranJanebi,
    });

    assert.strictEqual(result.summary.unknownStatusCount, 1);
    assert.strictEqual(result.unknownStatus[0].sku, 'SKU-UNKNOWN');
  });
});
