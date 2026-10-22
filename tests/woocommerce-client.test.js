import { describe, it } from 'node:test';
import assert from 'node:assert';
import { KianSmartClient } from '../src/clients/woocommerce-client.js';

describe('KianSmartClient (WooCommerce Integration)', () => {
  // Test 7: Paginated responses
  it('7. should handle paginated responses across multiple pages', async () => {
    let callCount = 0;
    const mockApi = {
      get: async (endpoint, params) => {
        callCount++;
        if (params.page === 1) {
          return {
            data: [
              { id: 1, name: 'Prod 1', sku: 'SKU-1', stock_status: 'outofstock', permalink: 'https://ks.ir/1' },
              { id: 2, name: 'Prod 2', sku: 'SKU-2', stock_status: 'outofstock', permalink: 'https://ks.ir/2' },
            ],
            headers: { 'x-wp-totalpages': '2', 'x-wp-total': '3' }
          };
        } else if (params.page === 2) {
          return {
            data: [
              { id: 3, name: 'Prod 3', sku: 'SKU-3', stock_status: 'outofstock', permalink: 'https://ks.ir/3' },
            ],
            headers: { 'x-wp-totalpages': '2', 'x-wp-total': '3' }
          };
        }
        return { data: [], headers: {} };
      }
    };

    const client = new KianSmartClient({
      apiClient: mockApi,
      url: 'https://mock-kiansmart.ir',
      consumerKey: 'ck_mock',
      consumerSecret: 'cs_mock',
    });

    const result = await client.fetchOutOfStockProducts({ perPage: 2 });
    assert.strictEqual(callCount, 2);
    assert.strictEqual(result.items.length, 3);
    assert.strictEqual(result.items[0].sku, 'SKU-1');
    assert.strictEqual(result.items[2].sku, 'SKU-3');
  });

  // Test 9: Product variations extraction
  it('9. should inspect variations when a variable product is encountered', async () => {
    const mockApi = {
      get: async (endpoint, params) => {
        if (endpoint === 'products') {
          return {
            data: [
              {
                id: 10,
                name: 'T-Shirt',
                type: 'variable',
                variations: [101, 102],
                permalink: 'https://ks.ir/tshirt'
              }
            ],
            headers: { 'x-wp-totalpages': '1' }
          };
        }
        if (endpoint === 'products/10/variations') {
          return {
            data: [
              {
                id: 101,
                sku: 'TSHIRT-RED-L',
                stock_status: 'outofstock',
                attributes: [{ name: 'Color', option: 'Red' }, { name: 'Size', option: 'L' }],
                permalink: 'https://ks.ir/tshirt?color=red&size=l'
              },
              {
                id: 102,
                sku: 'TSHIRT-BLUE-M',
                stock_status: 'instock', // should be excluded because it is in stock!
                attributes: [{ name: 'Color', option: 'Blue' }, { name: 'Size', option: 'M' }]
              }
            ]
          };
        }
        return { data: [] };
      }
    };

    const client = new KianSmartClient({
      apiClient: mockApi,
      url: 'https://mock-kiansmart.ir',
      consumerKey: 'ck_mock',
      consumerSecret: 'cs_mock',
    });

    const result = await client.fetchOutOfStockProducts({ includeVariations: true });
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].sku, 'TSHIRT-RED-L');
    assert.strictEqual(result.items[0].parentId, 10);
    assert.strictEqual(result.items[0].type, 'variation');
  });

  // Test 6: API authentication failures
  it('6. should reject cleanly with a descriptive error when WooCommerce authentication fails (401)', async () => {
    const mockApi = {
      get: async () => {
        const error = new Error('Unauthorized');
        error.response = { status: 401, data: { message: 'Invalid consumer key' } };
        throw error;
      }
    };

    const client = new KianSmartClient({
      apiClient: mockApi,
      url: 'https://mock-kiansmart.ir',
      consumerKey: 'ck_wrong',
      consumerSecret: 'cs_wrong',
    });

    await assert.rejects(
      async () => {
        await client.fetchOutOfStockProducts();
      },
      /WooCommerce authentication failed \(401\)/
    );
  });

  // Test 10: API timeouts or partial network failures
  it('10. should handle WooCommerce request timeout gracefully without corrupting state', async () => {
    const mockApi = {
      get: async () => {
        const error = new Error('timeout of 30000ms exceeded');
        error.code = 'ECONNABORTED';
        throw error;
      }
    };

    const client = new KianSmartClient({
      apiClient: mockApi,
      url: 'https://mock-kiansmart.ir',
      consumerKey: 'ck_mock',
      consumerSecret: 'cs_mock',
    });

    await assert.rejects(
      async () => {
        await client.fetchOutOfStockProducts();
      },
      /WooCommerce API timeout/
    );
  });
});
