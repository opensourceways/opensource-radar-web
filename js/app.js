/**
 * App module - orchestrates views, handles events, manages state.
 */

(function () {
  'use strict';

  // Available data files
  const DATA_FILES = [
    { label: '2026-03', file: 'radar_data_202603.csv' },
    { label: '2026-01', file: 'radar_data_202601.csv' },
  ];
  const DEFAULT_FILE = DATA_FILES[0].file;

  // State
  let radarItems = [];
  let currentView = 'radar'; // 'radar' | 'detail'
  let currentQuadrant = null;
  let detailSyncCleanup = null;

  // DOM refs
  const viewRadar = document.getElementById('view-radar');
  const viewDetail = document.getElementById('view-detail');
  const radarContainer = document.getElementById('radar-chart');
  const detailRadarContainer = document.getElementById('detail-radar-chart');
  const detailList = document.getElementById('detail-list');
  const fileInput = document.getElementById('file-input');
  const dataFileSelect = document.getElementById('data-file-select');
  const btnSample = document.getElementById('btn-load-sample');
  const btnExport = document.getElementById('btn-export-excel');
  const btnPdf = document.getElementById('btn-download-pdf');
  const btnBack = document.getElementById('btn-back');

  // ===================== Initialization =====================

  function init() {
    populateFileSelect();
    bindEvents();
    const activeFile = getFileFromURL();
    dataFileSelect.value = activeFile;
    loadDataFile(activeFile);
  }

  function populateFileSelect() {
    DATA_FILES.forEach(({ label, file }) => {
      const opt = document.createElement('option');
      opt.value = file;
      opt.textContent = label;
      dataFileSelect.appendChild(opt);
    });
  }

  function getFileFromURL() {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('file');
    const valid = DATA_FILES.find(d => d.file === requested);
    return valid ? valid.file : DEFAULT_FILE;
  }

  function bindEvents() {
    fileInput.addEventListener('change', handleFileUpload);
    dataFileSelect.addEventListener('change', handleDataFileChange);
    btnSample.addEventListener('click', handleLoadSample);
    btnExport.addEventListener('click', handleExportExcel);
    btnPdf.addEventListener('click', handleDownloadPDF);
    btnBack.addEventListener('click', showRadarView);
    window.addEventListener('resize', debounce(handleResize, 250));
  }

  function handleDataFileChange() {
    const file = dataFileSelect.value;
    const url = new URL(window.location.href);
    url.searchParams.set('file', file);
    history.pushState(null, '', url.toString());
    loadDataFile(file);
  }

  async function loadDataFile(filename) {
    try {
      const response = await fetch('data/' + filename, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const csvText = await response.text();
      radarItems = RadarData.parseCSV(csvText);

      if (radarItems.length === 0) {
        showEmptyState();
        return;
      }

      showRadarView();
    } catch (err) {
      console.warn('Data file load failed:', err);
      showEmptyState();
    }
  }

  // ===================== File Upload =====================

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      radarItems = await RadarData.parseFile(file);
      if (radarItems.length === 0) {
        alert('No valid radar items found in the file. Please check the format.');
        return;
      }
      showRadarView();
    } catch (err) {
      alert('Error parsing file: ' + err.message);
      console.error(err);
    }
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
              <span class="item-score">(score: ${escapeHtml(formatScore(item.score))})</span>
              ${movementIndicator(item.movement)}
            </span>
          </div>
          <div class="item-description">
            ${escapeHtml(item.description || '')}
            <div class="item-community-update"><strong>Community update:</strong> ${escapeHtml(item.communityUpdate || '')}</div>
          </div>
        `;

        card.addEventListener('mouseenter', () => setActiveDetailItem(item.id));
        card.addEventListener('click', () => setActiveDetailItem(item.id));

        section.appendChild(card);
      });

      detailList.appendChild(section);
    });

    bindDetailScrollSync();
  }

  function expandItem(id) {
    const card = detailList.querySelector(`[data-item-id="${id}"]`);
    if (card) {
      setActiveDetailItem(id);
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function setActiveDetailItem(id) {
    const targetId = String(id);

    detailList.querySelectorAll('.item-card').forEach((card) => {
      const isTarget = card.getAttribute('data-item-id') === targetId;
      card.classList.toggle('is-active', isTarget);
    });

    detailRadarContainer.querySelectorAll('.blip').forEach((blip) => {
      const isTarget = blip.getAttribute('data-item-id') === targetId;
      blip.classList.toggle('is-active', isTarget);
    });
  }

  function bindDetailScrollSync() {
    if (detailSyncCleanup) detailSyncCleanup();

    const cards = Array.from(detailList.querySelectorAll('.item-card'));
    if (!cards.length) return;

    const syncByViewportCenter = () => {
      const viewportCenter = window.innerHeight * 0.5;
      const activeBand = window.innerHeight * 0.2;

      let bestCard = null;
      let bestDistance = Infinity;

      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;

        const center = rect.top + rect.height / 2;
        const distance = Math.abs(center - viewportCenter);
        if (distance > activeBand) return;

        if (distance < bestDistance) {
          bestDistance = distance;
          bestCard = card;
        }
      });

      if (!bestCard) {
        cards.forEach((card) => {
          const rect = card.getBoundingClientRect();
          if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
          const center = rect.top + rect.height / 2;
          const distance = Math.abs(center - viewportCenter);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestCard = card;
          }
        });
      }

      if (bestCard) {
        const id = bestCard.getAttribute('data-item-id');
        if (id) setActiveDetailItem(id);
      }
    };

    let rafId = 0;
    const onScrollOrResize = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        syncByViewportCenter();
      });
    };

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);

    detailSyncCleanup = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      detailSyncCleanup = null;
    };

    syncByViewportCenter();
  }

  // ===================== PDF Generation =====================

  async function handleDownloadPDF() {
    if (radarItems.length === 0) {
      alert('No data to export yet. Load Excel or sample data first.');
      return;
    }

    btnPdf.disabled = true;
    btnPdf.textContent = 'Generating PDF...';

    try {
      await generatePDF();
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Error generating PDF: ' + err.message);
    } finally {
      btnPdf.disabled = false;
      btnPdf.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5L9.5 0H4zm5.5 1.5L13 5h-2.5a1 1 0 0 1-1-1V1.5zM4.5 8a.5.5 0 0 1 .5.5v.634l.549-.317a.5.5 0 0 1 .5.866L5.5 10l.549.317a.5.5 0 0 1-.5.866L5 10.866V11.5a.5.5 0 0 1-1 0v-.634l-.549.317a.5.5 0 0 1-.5-.866L3.5 10l-.549-.317a.5.5 0 1 1 .5-.866l.549.317V8.5a.5.5 0 0 1 .5-.5z"/>
        </svg>
        Download PDF
      `;
    }
  }

  async function generatePDF() {
    // Build chart images first (SVG → PNG data URL)
    const chartImages = {};
    for (const sectionName of RadarData.QUADRANTS) {
      const sectionItems = radarItems.filter(i => i.quadrant === sectionName);
      chartImages[sectionName] = await renderSectionChartToImage(sectionName, sectionItems);
    }

    // Build the full HTML document that will be printed
    const escHtml = (str) => {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };

    let body = '';
    RadarData.QUADRANTS.forEach((sectionName, si) => {
      const sectionItems = radarItems.filter(i => i.quadrant === sectionName);
      const color = RadarData.QUADRANT_COLORS[sectionName];
      const chartSrc = chartImages[sectionName];

      body += `<section class="pdf-section${si > 0 ? ' page-break' : ''}">`;

      if (chartSrc) {
        body += `<img class="chart-img" src="${chartSrc}" alt="${escHtml(sectionName)} radar">`;
      }

      body += `<h2 style="color:${escHtml(color)};border-bottom:3px solid ${escHtml(color)}">${escHtml(sectionName)}</h2>`;

      RadarData.RINGS.forEach((ring) => {
        const ringItems = sectionItems
          .filter(i => i.ring === ring)
          .sort((a, b) => a.id - b.id);
        if (ringItems.length === 0) return;

        body += `<h3>${escHtml(ring)}</h3>`;
        ringItems.forEach((item) => {
          let badge = '';
          if (item.movement === 'new') badge = ' <span class="badge badge-new">▲ New</span>';
          else if (item.movement === 'moved') badge = ' <span class="badge badge-moved">► Moved</span>';

          body += `<div class="item">`;
          body += `<div class="item-name">${item.id}. ${escHtml(item.name)}${badge}</div>`;
          if (item.description) {
            body += `<div class="item-desc">${escHtml(item.description)}</div>`;
          }
          if (item.communityUpdate) {
            body += `<div class="item-community"><span class="community-label">Community update:</span> ${escHtml(item.communityUpdate)}</div>`;
          }
          body += `</div>`;
        });
      });

      body += `</section>`;
    });

    const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>OpenSource Radar</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
                 'Noto Sans CJK SC', 'Source Han Sans CN', Arial, sans-serif;
    font-size: 12px;
    color: #333;
    background: #fff;
    padding: 20mm 15mm;
  }
  .page-break { page-break-before: always; }
  .chart-img {
    display: block;
    margin: 0 auto 16px;
    max-width: 340px;
    width: 55%;
  }
  h2 {
    font-size: 18px;
    padding-bottom: 6px;
    margin-bottom: 10px;
  }
  h3 {
    font-size: 14px;
    color: #505050;
    margin: 14px 0 4px;
    padding-bottom: 3px;
    border-bottom: 1px solid #ddd;
  }
  .item {
    margin-bottom: 8px;
    padding-left: 10px;
    page-break-inside: avoid;
  }
  .item-name {
    font-size: 12px;
    font-weight: bold;
    color: #222;
    margin-bottom: 2px;
  }
  .item-desc {
    font-size: 10.5px;
    color: #555;
    line-height: 1.65;
  }
  .item-community {
    font-size: 10px;
    color: #666;
    line-height: 1.6;
    margin-top: 3px;
    padding: 4px 6px;
    background: #f7f7f7;
    border-left: 2px solid #ccc;
  }
  .community-label {
    font-weight: bold;
    color: #444;
  }
  .badge {
    font-size: 10px;
    font-weight: normal;
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 4px;
  }
  .badge-new   { background: #e6f4ea; color: #2d6a4f; }
  .badge-moved { background: #fff3cd; color: #856404; }
  @media print {
    body { padding: 0; }
    @page { margin: 15mm; size: A4; }
  }
</style>
</head>
<body>${body}</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      alert('弹窗被阻止，请允许此页面打开新窗口后重试。');
      return;
    }
    win.document.write(html);
    win.document.close();
    // Wait for images to load before printing
    win.onload = () => {
      win.focus();
      win.print();
    };
    // Fallback if onload already fired
    if (win.document.readyState === 'complete') {
      win.focus();
      win.print();
    }
  }

  /**
   * Render a section's radar chart SVG into a PNG data URL using an offscreen container.
   */
  function renderSectionChartToImage(sectionName, sectionItems) {
    return new Promise((resolve) => {
      // Create an offscreen container
      const offscreen = document.createElement('div');
      offscreen.style.position = 'absolute';
      offscreen.style.left = '-9999px';
      offscreen.style.top = '-9999px';
      document.body.appendChild(offscreen);

      // Render the chart into the offscreen container
      RadarChart.renderQuadrant(offscreen, sectionItems, sectionName, () => {});

      const svg = offscreen.querySelector('svg');
      if (!svg) {
        document.body.removeChild(offscreen);
        resolve('');
        return;
      }

      // Remove tooltip elements
      const tooltip = offscreen.querySelector('.tooltip');
      if (tooltip) tooltip.remove();

      // Serialize SVG
      const svgData = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      const w = parseInt(svg.getAttribute('width')) || 800;
      const h = parseInt(svg.getAttribute('height')) || 800;

      img.onload = function () {
        const canvas = document.createElement('canvas');
        const scale = 2; // retina quality
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const dataUrl = canvas.toDataURL('image/png');
        URL.revokeObjectURL(url);
        document.body.removeChild(offscreen);
        resolve(dataUrl);
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        document.body.removeChild(offscreen);
        resolve('');
      };

      img.src = url;
    });
  }

  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : { r: 0, g: 0, b: 0 };
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

  function formatScore(score) {
    const numeric = Number(score);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : 'N/A';
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
