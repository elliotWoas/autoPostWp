import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TehranJanebiClient } from '../src/clients/tehranjanebi-client.js';

describe('TehranJanebiClient (Adapter & Integration)', () => {
  // Test 7: Paginated responses from TehranJanebi
  it('7. should retrieve paginated wholesale products across multiple pages', async () => {
    let callCount = 0;
    const mockHttp = {
      get: async (endpoint, options) => {
        callCount++;
        const page = options.params.page;
        if (page === 1) {
          return {
            data: {
              products: [
                { id: 'tj-1', title: 'TJ Charger 20W', sku: 'SKU-CHG-20W', stock_quantity: 40, url: '/product/chg-20w' },
                { id: 'tj-2', title: 'TJ Charger 65W', sku: 'SKU-CHG-65W', stock_quantity: 15, url: '/product/chg-65w' },
              ],
              total_pages: 2
            }
          };
        } else if (page === 2) {
          return {
            data: {
              products: [
                { id: 'tj-3', title: 'TJ Cable Lightning', sku: 'SKU-CBL-LT', stock_quantity: 100, url: '/product/cbl-lt' },
              ],
              total_pages: 2
            }
          };
        }
        return { data: { products: [] } };
      }
    };

    const client = new TehranJanebiClient({
      httpClient: mockHttp,
      baseUrl: 'https://www.tehranjanebi.com',
      maxRetries: 0
    });

    const result = await client.fetchInventorySnapshot({ perPage: 2 });
    assert.strictEqual(callCount, 2);
    assert.strictEqual(result.products.length, 3);
    assert.strictEqual(result.products[0].sku, 'SKU-CHG-20W');
    assert.strictEqual(result.products[0].stock_quantity, 40);
    assert.strictEqual(result.products[0].url, 'https://www.tehranjanebi.com/product/chg-20w');
  });

  // Test 6: API authentication failures
  it('6. should reject with a clear error on TehranJanebi authentication failure (401)', async () => {
    const mockHttp = {
      get: async () => {
        const error = new Error('Unauthorized');
        error.response = { status: 401, statusText: 'Unauthorized' };
        throw error;
      }
    };

    const client = new TehranJanebiClient({
      httpClient: mockHttp,
      baseUrl: 'https://www.tehranjanebi.com',
      maxRetries: 0
    });

    await assert.rejects(
      async () => {
        await client.fetchInventorySnapshot();
      },
      /TehranJanebi API authentication failure \(401\)/
    );
  });

  // Test 10: Retries on transient 502/429 errors and eventual success or timeout
  it('10. should retry on transient 502 Bad Gateway and succeed when next attempt works', async () => {
    let attempts = 0;
    const mockHttp = {
      get: async () => {
        attempts++;
        if (attempts === 1) {
          const err = new Error('Bad Gateway');
          err.response = { status: 502, statusText: 'Bad Gateway' };
          throw err;
        }
        return {
          data: {
            products: [
              { id: 'tj-recovered', title: 'Recovered Item', sku: 'SKU-REC', stock_status: 'instock', stock_quantity: 5 }
            ]
          }
        };
      }
    };

    const client = new TehranJanebiClient({
      httpClient: mockHttp,
      baseUrl: 'https://www.tehranjanebi.com',
      maxRetries: 2
    });

    const result = await client.fetchInventorySnapshot({ perPage: 10 });
    assert.strictEqual(attempts, 2);
    assert.strictEqual(result.products.length, 1);
    assert.strictEqual(result.products[0].sku, 'SKU-REC');
  });

  // Test: Failed API request must never be treated as empty inventory
  it('should NEVER treat a failed API request as an empty inventory', async () => {
    const mockHttp = {
      get: async () => {
        const err = new Error('Server connection refused');
        err.code = 'ECONNREFUSED';
        throw err;
      }
    };

    const client = new TehranJanebiClient({
      httpClient: mockHttp,
      baseUrl: 'https://www.tehranjanebi.com',
      maxRetries: 1
    });

    await assert.rejects(
      async () => {
        await client.fetchInventorySnapshot();
      },
      /TehranJanebi network error/
    );
  });
});
