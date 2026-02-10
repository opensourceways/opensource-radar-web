/**
 * App module - orchestrates views, handles events, manages state.
 */

(function () {
  'use strict';

  // State
  let radarItems = [];
  let currentView = 'radar'; // 'radar' | 'detail'
  let currentQuadrant = null;

  // DOM refs
  const viewRadar = document.getElementById('view-radar');
  const viewDetail = document.getElementById('view-detail');
  const radarContainer = document.getElementById('radar-chart');
  const detailRadarContainer = document.getElementById('detail-radar-chart');
  const detailList = document.getElementById('detail-list');
  const fileInput = document.getElementById('file-input');
  const btnSample = document.getElementById('btn-load-sample');
  const btnExport = document.getElementById('btn-export-excel');
  const btnBack = document.getElementById('btn-back');

  // ===================== Initialization =====================

  function init() {
    bindEvents();
    showEmptyState();
  }

  function bindEvents() {
    fileInput.addEventListener('change', handleFileUpload);
    btnSample.addEventListener('click', handleLoadSample);
    btnExport.addEventListener('click', handleExportExcel);
    btnBack.addEventListener('click', showRadarView);
    window.addEventListener('resize', debounce(handleResize, 250));
  }

  // ===================== File Upload =====================

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        radarItems = RadarData.parseExcel(evt.target.result);
        if (radarItems.length === 0) {
          alert('No valid radar items found in the Excel file. Please check the format.');
          return;
        }
        showRadarView();
      } catch (err) {
        alert('Error parsing Excel file: ' + err.message);
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset so same file can be re-uploaded
    fileInput.value = '';
  }

  function handleLoadSample() {
    radarItems = RadarData.getSampleData();
    showRadarView();
  }

  function handleExportExcel() {
    if (radarItems.length === 0) {
      alert('No data to export yet. Load Excel or sample data first.');
      return;
    }
    RadarData.exportExcel(radarItems, 'opensource-radar.xlsx');
  }

  // ===================== Views =====================

  function showEmptyState() {
    radarContainer.innerHTML = `
      <div class="empty-state">
        <h2>No data loaded</h2>
        <p>Click <strong>"Load Excel"</strong> to upload your radar data, or</p>
        <p>click <strong>"Load Sample Data"</strong> to see a demo.</p>
        <br>
        <p style="font-size:13px; color:#999;">
          Excel format: columns <code>id</code>, <code>name</code>, <code>quadrant</code>, <code>ring</code>, <code>movement</code>, <code>description</code>
        </p>
      </div>
    `;
  }

  function showRadarView() {
    currentView = 'radar';
    currentQuadrant = null;
    viewRadar.classList.add('active');
    viewDetail.classList.remove('active');
    renderRadar();
  }

  function showDetailView(quadrantName) {
    currentView = 'detail';
    currentQuadrant = quadrantName;
    viewRadar.classList.remove('active');
    viewDetail.classList.add('active');
    renderDetail(quadrantName);
  }

  // ===================== Rendering =====================

  function renderRadar() {
    if (radarItems.length === 0) {
      showEmptyState();
      return;
    }

    RadarChart.renderFull(
      radarContainer,
      radarItems,
      (quadrantName) => showDetailView(quadrantName),
      (item) => {
        // Clicking a blip in the full view navigates to the quadrant detail
        showDetailView(item.quadrant);
        // Then scroll to and expand the item
        setTimeout(() => expandItem(item.id), 100);
      }
    );
  }

  function renderDetail(quadrantName) {
    const quadrantItems = radarItems.filter(i => i.quadrant === quadrantName);
    const color = RadarData.QUADRANT_COLORS[quadrantName];
    const colorKey = RadarData.QUADRANT_KEYS[quadrantName];

    // Render the single-quadrant radar
    RadarChart.renderQuadrant(
      detailRadarContainer,
      quadrantItems,
      quadrantName,
      (item) => expandItem(item.id)
    );

    // Build item list grouped by ring
    detailList.innerHTML = '';

    RadarData.RINGS.forEach((ring) => {
      const ringItems = quadrantItems
        .filter(i => i.ring === ring)
        .sort((a, b) => a.id - b.id);

      if (ringItems.length === 0) return;

      const section = document.createElement('div');
      section.className = 'ring-section';

      const title = document.createElement('h2');
      title.className = 'ring-section-title';
      title.textContent = ring;
      section.appendChild(title);

      ringItems.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.setAttribute('data-item-id', item.id);

        card.innerHTML = `
          <div class="item-card-header">
            <span class="item-card-name">
              <span class="item-number bg-${colorKey}">${item.id}</span>
              ${escapeHtml(item.name)}
              ${movementIndicator(item.movement)}
            </span>
            <span class="item-expand-icon">&#8964;</span>
          </div>
          <div class="item-description">${escapeHtml(item.description)}</div>
        `;

        card.addEventListener('click', () => {
          card.classList.toggle('expanded');
        });

        section.appendChild(card);
      });

      detailList.appendChild(section);
    });
  }

  function expandItem(id) {
    const card = detailList.querySelector(`[data-item-id="${id}"]`);
    if (card) {
      // Collapse all others
      detailList.querySelectorAll('.item-card.expanded').forEach(c => c.classList.remove('expanded'));
      card.classList.add('expanded');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ===================== Utilities =====================

  function movementIndicator(movement) {
    if (movement === 'new') {
      return '<span class="movement-indicator" title="New">&#9650;</span>'; // triangle up
    }
    if (movement === 'moved') {
      return '<span class="movement-indicator" title="Moved in/out">&#9654;</span>'; // triangle right
    }
    return '';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function debounce(fn, ms) {
    let timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, arguments), ms);
    };
  }

  function handleResize() {
    if (currentView === 'radar' && radarItems.length > 0) {
      renderRadar();
    }
  }

  // Boot
  init();
})();
