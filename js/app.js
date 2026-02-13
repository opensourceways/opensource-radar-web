/**
 * App module - orchestrates views, handles events, manages state.
 */

(function () {
  'use strict';

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
  const btnSample = document.getElementById('btn-load-sample');
  const btnExport = document.getElementById('btn-export-excel');
  const btnPdf = document.getElementById('btn-download-pdf');
  const btnBack = document.getElementById('btn-back');

  // ===================== Initialization =====================

  function init() {
    bindEvents();
    loadDefaultData();
  }

  function bindEvents() {
    fileInput.addEventListener('change', handleFileUpload);
    btnSample.addEventListener('click', handleLoadSample);
    btnExport.addEventListener('click', handleExportExcel);
    btnPdf.addEventListener('click', handleDownloadPDF);
    btnBack.addEventListener('click', showRadarView);
    window.addEventListener('resize', debounce(handleResize, 250));
  }

  async function loadDefaultData() {
    try {
      const response = await fetch('data/radar_data_202601.csv', { cache: 'no-store' });
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
      console.warn('Default data load failed:', err);
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
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();   // 210
    const pageHeight = pdf.internal.pageSize.getHeight();  // 297
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    const sections = RadarData.QUADRANTS;

    for (let si = 0; si < sections.length; si++) {
      const sectionName = sections[si];
      const sectionItems = radarItems.filter(i => i.quadrant === sectionName);
      const color = RadarData.QUADRANT_COLORS[sectionName];

      if (si > 0) pdf.addPage();

      // --- Render radar chart to image ---
      const chartImg = await renderSectionChartToImage(sectionName, sectionItems);
      const chartSize = Math.min(contentWidth, 130); // mm
      const chartX = margin + (contentWidth - chartSize) / 2;
      pdf.addImage(chartImg, 'PNG', chartX, margin, chartSize, chartSize);

      // --- Section title ---
      let y = margin + chartSize + 8;
      const rgb = hexToRgb(color);
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(rgb.r, rgb.g, rgb.b);
      pdf.text(sectionName, margin, y);
      y += 3;

      // Line under title
      pdf.setDrawColor(rgb.r, rgb.g, rgb.b);
      pdf.setLineWidth(0.5);
      pdf.line(margin, y, margin + contentWidth, y);
      y += 6;

      // --- Items grouped by ring ---
      RadarData.RINGS.forEach((ring) => {
        const ringItems = sectionItems
          .filter(i => i.ring === ring)
          .sort((a, b) => a.id - b.id);

        if (ringItems.length === 0) return;

        // Check if ring header fits
        if (y > pageHeight - 20) {
          pdf.addPage();
          y = margin;
        }

        // Ring title
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(80, 80, 80);
        pdf.text(ring, margin, y);
        y += 2;
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.3);
        pdf.line(margin, y, margin + contentWidth, y);
        y += 5;

        ringItems.forEach((item) => {
          // Estimate space needed for this item
          const nameHeight = 5;
          pdf.setFontSize(9);
          const descLines = pdf.splitTextToSize(item.description || '', contentWidth - 8);
          const descHeight = descLines.length * 3.8;
          const totalHeight = nameHeight + descHeight + 4;

          if (y + totalHeight > pageHeight - margin) {
            pdf.addPage();
            y = margin;
          }

          // Item number circle
          pdf.setFillColor(rgb.r, rgb.g, rgb.b);
          pdf.circle(margin + 3, y - 1.5, 3, 'F');
          pdf.setFontSize(7);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(255, 255, 255);
          const idStr = String(item.id);
          const idWidth = pdf.getTextWidth(idStr);
          pdf.text(idStr, margin + 3 - idWidth / 2, y - 0.5);

          // Item name
          pdf.setFontSize(11);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(50, 50, 50);
          let nameStr = item.name;
          if (item.movement === 'new') nameStr += '  ▲ New';
          else if (item.movement === 'moved') nameStr += '  ► Moved';
          pdf.text(nameStr, margin + 8, y);
          y += 4;

          // Description
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(80, 80, 80);
          descLines.forEach((line) => {
            if (y > pageHeight - margin) {
              pdf.addPage();
              y = margin;
            }
            pdf.text(line, margin + 4, y);
            y += 3.8;
          });

          y += 3;
        });

        y += 2;
      });
    }

    pdf.save('opensource-radar.pdf');
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
