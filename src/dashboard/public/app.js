/**
 * Client Application for E-Commerce Control Panel
 * Handles Inventory Reconciliation & Product Publishing
 */

let appState = {
  activeView: 'reconciliationView',
  activeTab: 'opportunities',
  reportData: null,
  searchQuery: '',
  sortField: null,
  sortOrder: 'asc',
  reviewedSkus: new Set(JSON.parse(localStorage.getItem('inventory_reviewed_skus') || '[]')),
  publishResults: [],
};

// DOM Elements - Navigation
const navButtons = document.querySelectorAll('.nav-btn');
const viewPanels = document.querySelectorAll('.view-panel');

// DOM Elements - Alerts
const alertBox = document.getElementById('alertBox');
const alertTitle = document.getElementById('alertTitle');
const alertMessage = document.getElementById('alertMessage');

// DOM Elements - Inventory Reconciliation
const checkInventoryBtn = document.getElementById('checkInventoryBtn');
const btnSpinner = document.getElementById('btnSpinner');
const btnLabel = checkInventoryBtn.querySelector('.btn-label');
const searchInput = document.getElementById('searchInput');
const tableBody = document.getElementById('tableBody');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const reviewedCounterWrap = document.getElementById('reviewedCounterWrap');
const reviewedCounter = document.getElementById('reviewedCounter');

// Stats Elements
const statKianOutOfStock = document.getElementById('statKianOutOfStock');
const statOpportunities = document.getElementById('statOpportunities');
const statUnavailableBoth = document.getElementById('statUnavailableBoth');
const statMissingTJ = document.getElementById('statMissingTJ');
const lastCheckTimestamp = document.getElementById('lastCheckTimestamp');

// Tab Count Elements
const countTabOpportunities = document.getElementById('countTabOpportunities');
const countTabUnavailable = document.getElementById('countTabUnavailable');
const countTabMissing = document.getElementById('countTabMissing');
const countTabUnmatched = document.getElementById('countTabUnmatched');

// DOM Elements - Product Publisher
const publishUrlsInput = document.getElementById('publishUrlsInput');
const startPublishBtn = document.getElementById('startPublishBtn');
const publishSpinner = document.getElementById('publishSpinner');
const publishBtnLabel = startPublishBtn.querySelector('.publish-btn-label');
const sampleUrlsBtn = document.getElementById('sampleUrlsBtn');
const clearUrlsBtn = document.getElementById('clearUrlsBtn');
const publisherTableBody = document.getElementById('publisherTableBody');
const publishSummaryStats = document.getElementById('publishSummaryStats');
const publishSuccessCount = document.getElementById('publishSuccessCount');
const publishFailedCount = document.getElementById('publishFailedCount');

/**
 * Initialize on page load
 */
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupReconciliationEvents();
  setupPublisherEvents();
  updateReviewedCounter();
  checkServerStatus();
});

/**
 * Setup Main View Switching
 */
function setupNavigation() {
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.getAttribute('data-view');
      navButtons.forEach(b => b.classList.remove('active'));
      viewPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetView).classList.add('active');
      appState.activeView = targetView;
    });
  });
}

/**
 * Check initial server status
 */
async function checkServerStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.lastSummary && data.lastCheckTime) {
      lastCheckTimestamp.textContent = new Date(data.lastCheckTime).toLocaleString();
      statKianOutOfStock.textContent = data.lastSummary.totalKianSmartOutOfStock;
      statOpportunities.textContent = data.lastSummary.opportunitiesCount;
      statUnavailableBoth.textContent = data.lastSummary.unavailableOnBothCount;
      statMissingTJ.textContent = data.lastSummary.missingOnTehranJanebiCount;
    }
  } catch (err) {
    console.warn('Status check warning:', err);
  }
}

/**
 * Setup Inventory Reconciliation Event Handlers
 */
function setupReconciliationEvents() {
  checkInventoryBtn.addEventListener('click', triggerReconciliation);

  // Sub-tabs
  document.querySelectorAll('.table-section .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.table-section .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      appState.activeTab = btn.getAttribute('data-tab');
      renderReconciliationTable();
    });
  });

  // Search input with debounce
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      appState.searchQuery = e.target.value.trim().toLowerCase();
      renderReconciliationTable();
    }, 200);
  });

  // Column Sorting
  document.querySelectorAll('#inventoryTable th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.getAttribute('data-sort');
      if (appState.sortField === field) {
        appState.sortOrder = appState.sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        appState.sortField = field;
        appState.sortOrder = 'asc';
      }
      renderReconciliationTable();
    });
  });

  // Export CSV
  exportCsvBtn.addEventListener('click', exportToCsv);
}

/**
 * Trigger Inventory Reconciliation
 */
async function triggerReconciliation() {
  setReconciliationLoading(true);
  hideAlert();

  try {
    const response = await fetch('/api/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `Server responded with status ${response.status}`);
    }

    appState.reportData = result.data;
    updateStatsAndCounts(result.data);
    renderReconciliationTable();

  } catch (err) {
    console.error('Reconciliation error:', err);
    showAlert('Reconciliation Failed', err.message);
  } finally {
    setReconciliationLoading(false);
  }
}

/**
 * Update Metric Statistics
 */
function updateStatsAndCounts(data) {
  const summary = data.summary;

  statKianOutOfStock.textContent = summary.totalKianSmartOutOfStock || 0;
  statOpportunities.textContent = summary.opportunitiesCount || 0;
  statUnavailableBoth.textContent = summary.unavailableOnBothCount || 0;
  statMissingTJ.textContent = summary.missingOnTehranJanebiCount || 0;

  if (data.timestamp) {
    lastCheckTimestamp.textContent = new Date(data.timestamp).toLocaleString();
  }

  countTabOpportunities.textContent = summary.opportunitiesCount || 0;
  countTabUnavailable.textContent = summary.unavailableOnBothCount || 0;
  countTabMissing.textContent = summary.missingOnTehranJanebiCount || 0;
  countTabUnmatched.textContent = summary.unmatchedMissingSkuCount || 0;
}

/**
 * Get items for active reconciliation tab
 */
function getCurrentTabItems() {
  if (!appState.reportData) return [];

  switch (appState.activeTab) {
    case 'opportunities':
      return appState.reportData.opportunities || [];
    case 'unavailable':
      return appState.reportData.unavailableOnBoth || [];
    case 'missing':
      return appState.reportData.missingOnTehranJanebi || [];
    case 'unmatched':
      return appState.reportData.unmatchedRecords || [];
    default:
      return [];
  }
}

/**
 * Render Inventory Reconciliation Table
 */
function renderReconciliationTable() {
  let items = getCurrentTabItems();

  // Search filter
  if (appState.searchQuery) {
    const q = appState.searchQuery;
    items = items.filter(item => {
      const name = (item.name || item.kianSmartName || item.tehranJanebiName || '').toLowerCase();
      const sku = (item.sku || '').toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }

  // Sorting
  if (appState.sortField) {
    items = [...items].sort((a, b) => {
      let valA, valB;
      if (appState.sortField === 'name') {
        valA = a.kianSmartName || a.name || a.tehranJanebiName || '';
        valB = b.kianSmartName || b.name || b.tehranJanebiName || '';
      } else if (appState.sortField === 'sku') {
        valA = a.sku || '';
        valB = b.sku || '';
      } else if (appState.sortField === 'quantity') {
        valA = a.tehranJanebiQuantity !== null && a.tehranJanebiQuantity !== undefined ? a.tehranJanebiQuantity : -1;
        valB = b.tehranJanebiQuantity !== null && b.tehranJanebiQuantity !== undefined ? b.tehranJanebiQuantity : -1;
      }

      if (valA < valB) return appState.sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return appState.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  if (items.length === 0) {
    tableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-state-icon">📦</div>
            <h3>No Products to Display</h3>
            <p>${appState.searchQuery ? 'No items match your search query.' : 'No records found in this category.'}</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = items.map(item => {
    const sku = item.sku || '-';
    const isReviewed = sku !== '-' && appState.reviewedSkus.has(sku);
    const productName = item.kianSmartName || item.name || item.tehranJanebiName || 'Untitled Product';
    const wholesaleUrl = item.tehranJanebiUrl || (item.sku ? `https://www.tehranjanebi.com/product/${encodeURIComponent(item.sku)}` : '#');
    const hasWholesaleUrl = wholesaleUrl && wholesaleUrl !== '#';

    // Stock Quantity Display
    let qtyDisplay = '<span class="text-muted">Unspecified</span>';
    if (item.tehranJanebiQuantity !== null && item.tehranJanebiQuantity !== undefined) {
      qtyDisplay = `<span class="quantity-badge ${item.tehranJanebiQuantity > 0 ? 'text-success' : 'text-danger'}">${item.tehranJanebiQuantity}</span>`;
    } else if (item.tehranJanebiAvailable) {
      qtyDisplay = '<span class="badge badge-success">Available</span>';
    }

    // Availability Badge
    let tjStatusBadge = '<span class="badge badge-unknown">Unknown</span>';
    if (item.tehranJanebiAvailable || item.tehranJanebiStockStatus === 'instock') {
      tjStatusBadge = '<span class="badge badge-instock">In Stock</span>';
    } else if (item.tehranJanebiStockStatus === 'outofstock') {
      tjStatusBadge = '<span class="badge badge-outofstock">Out of Stock</span>';
    } else if (appState.activeTab === 'missing') {
      tjStatusBadge = '<span class="badge badge-warning">Not Found</span>';
    }

    return `
      <tr class="${isReviewed ? 'row-reviewed' : ''}" data-sku="${sku}">
        <td style="text-align: center;">
          <input type="checkbox" class="review-chk" ${isReviewed ? 'checked' : ''} onchange="toggleReviewed('${escapeHtml(sku)}')" title="Mark reviewed for manual purchase">
        </td>
        <td>
          <strong>${escapeHtml(productName)}</strong>
          ${item.tehranJanebiName && item.tehranJanebiName !== productName ? `<div style="font-size: 0.75rem; color: #64748b;">TJ: ${escapeHtml(item.tehranJanebiName)}</div>` : ''}
        </td>
        <td>
          <div class="sku-tag">
            <span>${escapeHtml(sku)}</span>
            ${sku !== '-' ? `<button class="copy-sku-btn" onclick="copySku('${escapeHtml(sku)}')" title="Copy SKU">📋</button>` : ''}
          </div>
        </td>
        <td>
          <span class="badge badge-outofstock">Out of Stock</span>
        </td>
        <td>
          ${tjStatusBadge}
        </td>
        <td style="text-align: center;">
          ${qtyDisplay}
        </td>
        <td style="text-align: center;">
          ${hasWholesaleUrl ? `
            <a href="${wholesaleUrl}" target="_blank" rel="noopener noreferrer" class="link-btn">
              View Wholesale ↗
            </a>
          ` : '<span class="text-muted">-</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Toggle reviewed checkbox and persist in localStorage
 */
window.toggleReviewed = function(sku) {
  if (!sku || sku === '-') return;

  if (appState.reviewedSkus.has(sku)) {
    appState.reviewedSkus.delete(sku);
  } else {
    appState.reviewedSkus.add(sku);
  }

  localStorage.setItem('inventory_reviewed_skus', JSON.stringify([...appState.reviewedSkus]));
  updateReviewedCounter();

  const row = document.querySelector(`tr[data-sku="${sku}"]`);
  if (row) {
    if (appState.reviewedSkus.has(sku)) {
      row.classList.add('row-reviewed');
    } else {
      row.classList.remove('row-reviewed');
    }
  }
};

/**
 * Update Reviewed Counter Pill
 */
function updateReviewedCounter() {
  const count = appState.reviewedSkus.size;
  if (count > 0) {
    reviewedCounterWrap.style.display = 'inline-flex';
    reviewedCounter.textContent = count;
  } else {
    reviewedCounterWrap.style.display = 'none';
  }
}

/**
 * Copy SKU to Clipboard
 */
window.copySku = function(sku) {
  navigator.clipboard.writeText(sku).then(() => {
    const btn = event.target;
    const oldText = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = oldText; }, 1200);
  });
};

/**
 * Export current view to CSV
 */
function exportToCsv() {
  const items = getCurrentTabItems();
  if (items.length === 0) {
    alert('No items to export.');
    return;
  }

  const headers = ['Reviewed', 'Product Name', 'SKU', 'KianSmart Status', 'Wholesale Status', 'Quantity', 'Wholesale URL'];
  const rows = items.map(item => {
    const sku = item.sku || '';
    const reviewed = appState.reviewedSkus.has(sku) ? 'Yes' : 'No';
    const name = (item.kianSmartName || item.name || item.tehranJanebiName || '').replace(/"/g, '""');
    const ksStatus = 'Out of Stock';
    const tjStatus = item.tehranJanebiAvailable ? 'In Stock' : (item.tehranJanebiStockStatus || 'Unknown');
    const qty = item.tehranJanebiQuantity !== null && item.tehranJanebiQuantity !== undefined ? item.tehranJanebiQuantity : 'Unspecified';
    const url = item.tehranJanebiUrl || '';

    return `"${reviewed}","${name}","${sku}","${ksStatus}","${tjStatus}","${qty}","${url}"`;
  });

  const csvContent = '\uFEFF' + [headers.map(h => `"${h}"`).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventory-reconciliation-${appState.activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ====================================================================
// PRODUCT PUBLISHER CONTROLLER
// ====================================================================

function setupPublisherEvents() {
  startPublishBtn.addEventListener('click', triggerBatchPublish);

  sampleUrlsBtn.addEventListener('click', () => {
    publishUrlsInput.value = 'https://www.tehranjanebi.com/product/PSH954-ProOne-Rechargeable-Shaver/\nhttps://rezonal.co/product/clipper-titan-plus/';
  });

  clearUrlsBtn.addEventListener('click', () => {
    publishUrlsInput.value = '';
    publishUrlsInput.focus();
  });
}

/**
 * Trigger Batch Publishing
 */
async function triggerBatchPublish() {
  const rawInput = publishUrlsInput.value.trim();
  if (!rawInput) {
    alert('Please enter at least one product URL.');
    publishUrlsInput.focus();
    return;
  }

  const urls = rawInput.split('\n').map(u => u.trim()).filter(u => u.length > 0);
  if (urls.length === 0) {
    alert('Please enter valid product URLs.');
    return;
  }

  setPublisherLoading(true);
  hideAlert();

  try {
    const response = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `Server responded with status ${response.status}`);
    }

    appState.publishResults = data.results || [];
    renderPublisherResults(data);

  } catch (err) {
    console.error('Publish error:', err);
    showAlert('Publishing Failed', err.message);
  } finally {
    setPublisherLoading(false);
  }
}

/**
 * Render Publisher Results Table
 */
function renderPublisherResults(data) {
  const results = data.results || [];
  const summary = data.summary || { succeeded: 0, failed: 0 };

  publishSummaryStats.style.display = 'inline-flex';
  publishSuccessCount.textContent = `${summary.succeeded} Succeeded`;
  publishFailedCount.textContent = `${summary.failed} Failed`;

  if (results.length === 0) {
    publisherTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-state-icon">🚀</div>
            <h3>No Results</h3>
            <p>No products were processed.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  publisherTableBody.innerHTML = results.map(item => {
    const isSuccess = item.status === 'success';
    const statusBadge = isSuccess
      ? '<span class="badge badge-instock">Published</span>'
      : '<span class="badge badge-outofstock">Failed</span>';

    return `
      <tr>
        <td>${statusBadge}</td>
        <td>
          <strong>${escapeHtml(item.name || 'Untitled Product')}</strong>
        </td>
        <td>
          ${item.productId ? `<span class="sku-tag">#${item.productId}</span>` : '<span class="text-muted">-</span>'}
        </td>
        <td>
          ${item.sku && item.sku !== '(not set)' ? `<span class="sku-tag">${escapeHtml(item.sku)}</span>` : '<span class="text-muted">-</span>'}
        </td>
        <td>
          ${item.price ? `${item.price}` : '<span class="text-muted">-</span>'}
        </td>
        <td style="text-align: center;">
          ${item.imagesCount !== undefined ? item.imagesCount : '-'}
        </td>
        <td>
          <a href="${item.url}" target="_blank" rel="noopener noreferrer" style="font-size: 0.78rem; color: #2563eb; word-break: break-all;">
            ${escapeHtml(item.url)}
          </a>
          ${item.error ? `<div style="color: #dc2626; font-size: 0.75rem; margin-top: 0.2rem;">Error: ${escapeHtml(item.error)}</div>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// Helpers
function setReconciliationLoading(loading) {
  if (loading) {
    checkInventoryBtn.disabled = true;
    btnSpinner.style.display = 'inline-block';
    btnLabel.textContent = 'Checking Inventory...';
  } else {
    checkInventoryBtn.disabled = false;
    btnSpinner.style.display = 'none';
    btnLabel.textContent = 'Check Inventory';
  }
}

function setPublisherLoading(loading) {
  if (loading) {
    startPublishBtn.disabled = true;
    publishSpinner.style.display = 'inline-block';
    publishBtnLabel.textContent = 'Scraping & Publishing...';
  } else {
    startPublishBtn.disabled = false;
    publishSpinner.style.display = 'none';
    publishBtnLabel.textContent = 'Start Publishing';
  }
}

function showAlert(title, message) {
  alertTitle.textContent = title;
  alertMessage.textContent = message;
  alertBox.style.display = 'flex';
}

window.closeAlert = function() {
  alertBox.style.display = 'none';
};

function hideAlert() {
  alertBox.style.display = 'none';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
