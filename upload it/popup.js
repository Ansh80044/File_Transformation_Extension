/**
 * ============================================================================
 * OPTIUPLOAD PRO - POPUP SCRIPT
 * ============================================================================
 * Manifest V3 CSP Compliant External Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  const FT = Object.assign({}, window.FileTransformUtilities || {}, window.FileTransformModule || {});

  // State
  let currentFile = null;
  let activePreset = 'web-optimized';
  let lastResult = null;
  let batchResults = [];

  // Elements - Theme
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const sunIcon = document.getElementById('themeIconSun');
  const moonIcon = document.getElementById('themeIconMoon');

  // Elements - Tabs & Navigation
  const tabs = document.querySelectorAll('.nav-pill');
  const panes = document.querySelectorAll('.tab-view');

  // Elements - Single View
  const presetChips = document.querySelectorAll('.preset-chip');
  const dropCard = document.getElementById('dropCard');
  const filePickerBox = document.getElementById('filePickerBox');
  const fileInput = document.getElementById('fileInput');
  const fileNameDisplay = document.getElementById('fileNameDisplay');
  const previewContainer = document.getElementById('previewContainer');
  const previewThumbnail = document.getElementById('previewThumbnail');
  const previewMeta = document.getElementById('previewMeta');
  const btnChangePreset = document.getElementById('btnChangePreset');
  const btnDownload = document.getElementById('btnDownload');
  const btnTrySample = document.getElementById('btnTrySample');
  const btnCopyBase64 = document.getElementById('btnCopyBase64');
  const toggleAutoDownload = document.getElementById('toggleAutoDownload');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const metricsPill = document.getElementById('metricsPill');
  const metricsTitle = document.getElementById('metricsTitle');
  const metricsSavingsBadge = document.getElementById('metricsSavingsBadge');

  // Elements - Batch View
  const batchDropCard = document.getElementById('batchDropCard');
  const batchPickerBox = document.getElementById('batchPickerBox');
  const batchFileInput = document.getElementById('batchFileInput');
  const batchFileNameDisplay = document.getElementById('batchFileNameDisplay');
  const batchQueueList = document.getElementById('batchQueueList');
  const btnBatchDownloadAll = document.getElementById('btnBatchDownloadAll');
  const btnBatchSample = document.getElementById('btnBatchSample');

  // Elements - Custom View
  const customFormatSelect = document.getElementById('customFormatSelect');
  const customQualitySlider = document.getElementById('customQualitySlider');
  const customQualityVal = document.getElementById('customQualityVal');
  const customMaxSizeInput = document.getElementById('customMaxSizeInput');
  const customMaxW = document.getElementById('customMaxW');
  const customMaxH = document.getElementById('customMaxH');
  const btnApplyCustom = document.getElementById('btnApplyCustom');

  // Elements - History & Toast
  const historyList = document.getElementById('historyList');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const toastPill = document.getElementById('toastPill');

  // Helper: File Type Check
  function isSupportedImage(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith('image/')) return true;
    const ext = (file.name || '').split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'avif'].includes(ext);
  }

  // Helper: Toast Notification
  function showToast(msg) {
    if (!toastPill) return;
    toastPill.textContent = msg;
    toastPill.classList.add('show');
    setTimeout(() => toastPill.classList.remove('show'), 2200);
  }

  // Helper: Format Bytes fallback
  function formatBytesSafe(bytes) {
    if (typeof FT.formatBytes === 'function') {
      return FT.formatBytes(bytes);
    }
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i] || 'B'}`;
  }

  // Generate Sample Image on-the-fly
  function createSampleFile(name = 'sample-hero.jpg', w = 1600, h = 1200, c1 = '#00b87c', c2 = '#3b82f6') {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(w * 0.15, h * 0.25, w * 0.7, h * 0.5, 30);
      } else {
        ctx.rect(w * 0.15, h * 0.25, w * 0.7, h * 0.5);
      }
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 52px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OptiUpload Pro Asset', w * 0.5, h * 0.46);

      ctx.fillStyle = '#00b87c';
      ctx.font = 'bold 36px Poppins, sans-serif';
      ctx.fillText(`Raw High-Res Sample (${w}×${h}px)`, w * 0.5, h * 0.55);

      ctx.fillStyle = '#64748b';
      ctx.font = '24px Poppins, sans-serif';
      ctx.fillText('Ready for instant zero-server browser optimization', w * 0.5, h * 0.63);

      canvas.toBlob((blob) => {
        const file = new File([blob], name, { type: 'image/jpeg' });
        resolve(file);
      }, 'image/jpeg', 0.95);
    });
  }

  // Theme Management
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      if (sunIcon) sunIcon.style.display = 'none';
      if (moonIcon) moonIcon.style.display = 'inline-flex';
    } else {
      if (sunIcon) sunIcon.style.display = 'inline-flex';
      if (moonIcon) moonIcon.style.display = 'none';
    }
  }

  const savedTheme = localStorage.getItem('optiupload_theme') || 'light';
  applyTheme(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('optiupload_theme', next);
      showToast(`${next === 'dark' ? 'Dark' : 'Light'} mode enabled`);
    });
  }

  // Tab Navigation
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(`view-${tab.dataset.tab}`);
      if (target) target.classList.add('active');
      if (tab.dataset.tab === 'history') renderHistory();
    });
  });

  // Preset Chips
  presetChips.forEach(chip => {
    chip.addEventListener('click', async () => {
      presetChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activePreset = chip.dataset.preset;
      
      if (!currentFile) {
        currentFile = await createSampleFile();
        if (fileNameDisplay) fileNameDisplay.textContent = currentFile.name;
        showToast(`Loaded sample with preset: ${chip.textContent}`);
      } else {
        showToast(`Preset: ${chip.textContent}`);
      }
      processSingleFile(currentFile);
    });
  });

  // Single File Picker & Drop Card Events
  if (filePickerBox && fileInput) {
    filePickerBox.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (dropCard && fileInput) {
    dropCard.addEventListener('click', (e) => {
      // Don't trigger if clicked an action button
      if (e.target.closest('.action-pill-btn') || e.target.closest('#btnTrySample') || e.target.closest('.file-pill-box')) {
        return;
      }
      fileInput.click();
    });

    dropCard.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropCard.style.borderColor = 'var(--accent-green)';
      dropCard.style.background = 'rgba(0, 184, 124, 0.05)';
    });

    dropCard.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropCard.style.borderColor = 'var(--border-dashed)';
      dropCard.style.background = 'var(--bg-card)';
    });

    dropCard.addEventListener('drop', (e) => {
      e.preventDefault();
      dropCard.style.borderColor = 'var(--border-dashed)';
      dropCard.style.background = 'var(--bg-card)';
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleSingleFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleSingleFile(e.target.files[0]);
      }
      // Reset input value so same file can be picked again
      fileInput.value = '';
    });
  }

  function handleSingleFile(file) {
    if (!isSupportedImage(file)) {
      showToast('Please select a valid image file');
      return;
    }
    currentFile = file;
    if (fileNameDisplay) fileNameDisplay.textContent = file.name;
    showToast(`Loaded: ${file.name}`);
    processSingleFile(file);
  }

  // Update Thumbnail Preview
  function updatePreview(file, origMeta, transformedFile, newMeta) {
    if (!previewContainer || !previewThumbnail || !previewMeta) return;
    
    previewContainer.style.display = 'flex';
    try {
      const thumbUrl = URL.createObjectURL(file);
      previewThumbnail.src = thumbUrl;
    } catch (e) {}

    const dimStr = origMeta && origMeta.width ? `${origMeta.width}×${origMeta.height}px` : '';
    const origSizeStr = formatBytesSafe(origMeta ? origMeta.size : file.size);
    const newSizeStr = transformedFile ? formatBytesSafe(transformedFile.size) : '';
    const targetFmt = (newMeta && newMeta.format ? newMeta.format : 'PRO').toUpperCase();

    previewMeta.innerHTML = `
      <div style="font-weight: 700; color: var(--text-main); font-size: 11px; margin-bottom: 2px;">
        ${file.name}
      </div>
      <div style="font-size: 10px; color: var(--text-muted); display: flex; gap: 6px; align-items: center;">
        <span>${dimStr || 'Image'}</span>
        <span>•</span>
        <span style="font-weight: 600; color: var(--accent-green);">${targetFmt}</span>
        <span>•</span>
        <span>${origSizeStr}${newSizeStr ? ` → <b>${newSizeStr}</b>` : ''}</span>
      </div>
    `;
  }

  // Try Sample Asset
  if (btnTrySample) {
    btnTrySample.addEventListener('click', async (e) => {
      e.stopPropagation();
      showToast('Generating HD sample image...');
      const sample = await createSampleFile();
      currentFile = sample;
      if (fileNameDisplay) fileNameDisplay.textContent = sample.name;
      processSingleFile(sample);
    });
  }

  // Single File Processing Engine
  async function processSingleFile(file, customOptions = null) {
    if (!progressBar || !progressFill || !metricsTitle || !metricsSavingsBadge) return;

    progressBar.classList.add('show');
    progressFill.style.width = '25%';
    metricsTitle.textContent = 'Analyzing & Optimizing...';
    metricsSavingsBadge.textContent = 'Processing...';

    const startTime = performance.now();

    try {
      let constraints = customOptions || (FT.getConstraintPreset ? FT.getConstraintPreset(activePreset) : {}) || {};
      const validation = FT.validateConstraints ? FT.validateConstraints(constraints) : { isValid: true, normalized: constraints };
      
      progressFill.style.width = '60%';

      const transformFn = FT.transformFile || (window.FileTransformModule && window.FileTransformModule.transformFile);
      if (!transformFn) {
        throw new Error('Transform engine not loaded.');
      }

      const result = await transformFn(file, validation.normalized);
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      progressFill.style.width = '100%';
      setTimeout(() => progressBar.classList.remove('show'), 350);

      lastResult = result;
      const origSize = result.originalMetadata ? result.originalMetadata.size : file.size;
      const newSize = result.newMetadata ? result.newMetadata.size : result.transformedFile.size;
      
      let percentReduction = 0;
      if (origSize > 0) {
        percentReduction = Math.max(0, Math.round(((origSize - newSize) / origSize) * 100));
      }

      const formattedOrig = formatBytesSafe(origSize);
      const formattedNew = formatBytesSafe(newSize);

      if (fileNameDisplay) {
        fileNameDisplay.textContent = `${result.transformedFile.name} (${formattedNew})`;
      }

      metricsTitle.textContent = `${formattedOrig} → ${formattedNew}`;
      metricsSavingsBadge.textContent = percentReduction > 0 ? `-${percentReduction}% Saved` : `Optimized`;

      updatePreview(file, result.originalMetadata, result.transformedFile, result.newMetadata);

      if (toggleAutoDownload && toggleAutoDownload.checked) {
        triggerDownload(result.transformedFile);
      }

      if (FT.saveToHistory) {
        FT.saveToHistory({
          name: file.name,
          originalSize: origSize,
          newSize: newSize,
          format: (result.newMetadata && result.newMetadata.format) || 'optimized',
          savingsPercent: percentReduction,
          durationSec: (durationMs / 1000).toFixed(2)
        });
      }

    } catch (err) {
      console.error('Processing error:', err);
      progressBar.classList.remove('show');
      metricsTitle.textContent = 'Optimization ready';
      metricsSavingsBadge.textContent = 'Error';
      showToast('Error: ' + err.message);
    }
  }

  // Trigger Download
  function triggerDownload(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name || 'optimized-image';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 400);
    showToast(`Downloading ${file.name}`);
  }

  // Download Button Click
  if (btnDownload) {
    btnDownload.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!lastResult) {
        if (!currentFile) {
          showToast('Generating sample for download...');
          currentFile = await createSampleFile();
          if (fileNameDisplay) fileNameDisplay.textContent = currentFile.name;
        }
        await processSingleFile(currentFile);
      }
      if (lastResult && lastResult.transformedFile) {
        triggerDownload(lastResult.transformedFile);
      }
    });
  }

  // Change Preset / Cycle Button
  if (btnChangePreset) {
    btnChangePreset.addEventListener('click', (e) => {
      e.stopPropagation();
      const chips = Array.from(presetChips);
      const currentIndex = chips.findIndex(p => p.classList.contains('active'));
      const nextIndex = (currentIndex + 1) % chips.length;
      chips[nextIndex].click();
    });
  }

  // Copy Base64
  if (btnCopyBase64) {
    btnCopyBase64.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!lastResult) {
        if (!currentFile) {
          currentFile = await createSampleFile();
          if (fileNameDisplay) fileNameDisplay.textContent = currentFile.name;
        }
        await processSingleFile(currentFile);
      }
      if (lastResult && lastResult.transformedFile) {
        try {
          const blobToBase64Fn = FT.blobToBase64 || (window.FileTransformModule && window.FileTransformModule.blobToBase64);
          if (blobToBase64Fn) {
            const base64 = await blobToBase64Fn(lastResult.transformedFile);
            await navigator.clipboard.writeText(base64);
            showToast('Base64 copied to clipboard');
          } else {
            const reader = new FileReader();
            reader.onload = async () => {
              await navigator.clipboard.writeText(reader.result);
              showToast('Base64 copied to clipboard');
            };
            reader.readAsDataURL(lastResult.transformedFile);
          }
        } catch (err) {
          showToast('Failed to copy to clipboard');
        }
      }
    });
  }

  // Custom Studio
  if (customQualitySlider && customQualityVal) {
    customQualitySlider.addEventListener('input', () => {
      customQualityVal.textContent = `${customQualitySlider.value}%`;
    });
  }

  if (btnApplyCustom) {
    btnApplyCustom.addEventListener('click', async () => {
      if (!currentFile) {
        showToast('Using sample file for custom transform...');
        currentFile = await createSampleFile();
        if (fileNameDisplay) fileNameDisplay.textContent = currentFile.name;
      }

      const fmt = customFormatSelect ? customFormatSelect.value : 'webp';
      const q = customQualitySlider ? parseFloat(customQualitySlider.value) / 100 : 0.85;
      const maxSize = customMaxSizeInput ? customMaxSizeInput.value.trim() : '';
      const maxW = customMaxW && customMaxW.value ? parseInt(customMaxW.value) : null;
      const maxH = customMaxH && customMaxH.value ? parseInt(customMaxH.value) : null;

      const customOpts = {
        targetFormat: fmt,
        quality: q,
        ...(maxSize && { maxSize }),
        ...(maxW && { maxWidth: maxW }),
        ...(maxH && { maxHeight: maxH })
      };

      // Switch to Single view and process
      const singleTab = document.querySelector('[data-tab="single"]');
      if (singleTab) singleTab.click();
      showToast(`Applying custom settings (${fmt.toUpperCase()})...`);
      processSingleFile(currentFile, customOpts);
    });
  }

  // Batch View Handlers
  if (batchPickerBox && batchFileInput) {
    batchPickerBox.addEventListener('click', (e) => {
      e.stopPropagation();
      batchFileInput.click();
    });
  }

  if (batchDropCard && batchFileInput) {
    batchDropCard.addEventListener('click', (e) => {
      if (e.target.closest('.action-pill-btn') || e.target.closest('.file-pill-box')) return;
      batchFileInput.click();
    });

    batchDropCard.addEventListener('dragover', (e) => {
      e.preventDefault();
      batchDropCard.style.borderColor = 'var(--accent-green)';
      batchDropCard.style.background = 'rgba(0, 184, 124, 0.05)';
    });

    batchDropCard.addEventListener('dragleave', (e) => {
      e.preventDefault();
      batchDropCard.style.borderColor = 'var(--border-dashed)';
      batchDropCard.style.background = 'var(--bg-card)';
    });

    batchDropCard.addEventListener('drop', (e) => {
      e.preventDefault();
      batchDropCard.style.borderColor = 'var(--border-dashed)';
      batchDropCard.style.background = 'var(--bg-card)';
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleBatch(Array.from(e.dataTransfer.files));
      }
    });
  }

  if (batchFileInput) {
    batchFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleBatch(Array.from(e.target.files));
      }
      batchFileInput.value = '';
    });
  }

  if (btnBatchSample) {
    btnBatchSample.addEventListener('click', async (e) => {
      e.stopPropagation();
      showToast('Generating 3 sample assets...');
      const s1 = await createSampleFile('banner-hero.jpg', 1600, 1200, '#00b87c', '#0ea5e9');
      const s2 = await createSampleFile('avatar-square.jpg', 1000, 1000, '#6366f1', '#ec4899');
      const s3 = await createSampleFile('header-wide.jpg', 1920, 1080, '#f59e0b', '#ef4444');
      handleBatch([s1, s2, s3]);
    });
  }

  async function handleBatch(files) {
    const validImages = files.filter(isSupportedImage);
    if (validImages.length === 0) {
      showToast('No valid images selected for batch');
      return;
    }

    if (batchFileNameDisplay) {
      batchFileNameDisplay.textContent = `${validImages.length} files selected`;
    }

    if (batchQueueList) batchQueueList.innerHTML = '';
    batchResults = [];

    const constraints = (FT.getConstraintPreset ? FT.getConstraintPreset(activePreset) : {}) || {};
    const transformFn = FT.transformFile || (window.FileTransformModule && window.FileTransformModule.transformFile);

    for (let file of validImages) {
      const item = document.createElement('div');
      item.className = 'batch-card-item';
      item.innerHTML = `
        <div style="flex: 1; overflow: hidden;">
          <div class="batch-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${file.name}</div>
          <div class="batch-meta">Processing...</div>
        </div>
        <span style="font-size: 11px; color: var(--accent-green); font-weight: 700;">...</span>
      `;
      if (batchQueueList) batchQueueList.appendChild(item);

      try {
        const res = await transformFn(file, constraints);
        batchResults.push(res);
        const origS = formatBytesSafe(res.originalMetadata ? res.originalMetadata.size : file.size);
        const newS = formatBytesSafe(res.newMetadata ? res.newMetadata.size : res.transformedFile.size);
        const origBytes = res.originalMetadata ? res.originalMetadata.size : file.size;
        const newBytes = res.newMetadata ? res.newMetadata.size : res.transformedFile.size;
        const pct = origBytes > 0 ? Math.max(0, Math.round(((origBytes - newBytes) / origBytes) * 100)) : 0;

        item.innerHTML = `
          <div style="flex: 1; overflow: hidden; padding-right: 8px;">
            <div class="batch-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${res.transformedFile.name}</div>
            <div class="batch-meta">${origS} → <b>${newS}</b> <span style="color: var(--accent-green); font-weight: 700;">(-${pct}%)</span></div>
          </div>
          <button class="btn-save-sm">Save</button>
        `;

        const saveBtn = item.querySelector('.btn-save-sm');
        if (saveBtn) {
          saveBtn.addEventListener('click', () => triggerDownload(res.transformedFile));
        }

      } catch (err) {
        item.innerHTML = `
          <div style="flex: 1;">
            <div class="batch-title">${file.name}</div>
            <div class="batch-meta" style="color: #ef4444;">Failed: ${err.message}</div>
          </div>
        `;
      }
    }
    showToast(`Batch completed (${validImages.length} files)`);
  }

  if (btnBatchDownloadAll) {
    btnBatchDownloadAll.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (batchResults.length === 0) {
        showToast('Creating and processing sample batch...');
        const s1 = await createSampleFile('hero-1.jpg', 1200, 800, '#00b87c', '#0ea5e9');
        const s2 = await createSampleFile('hero-2.jpg', 1000, 1000, '#6366f1', '#a855f7');
        await handleBatch([s1, s2]);
      }
      batchResults.forEach((res, i) => {
        setTimeout(() => triggerDownload(res.transformedFile), i * 250);
      });
    });
  }

  // History Tab Renderer
  function renderHistory() {
    if (!historyList) return;
    const history = FT.getHistory ? FT.getHistory() : [];
    if (!history || history.length === 0) {
      historyList.innerHTML = '<div style="text-align: center; color: var(--text-dim); font-size: 12px; padding: 24px;">No transformations logged yet.<br>Optimize any file to see it here!</div>';
      return;
    }
    historyList.innerHTML = '';
    history.forEach(h => {
      const div = document.createElement('div');
      div.className = 'batch-card-item';
      div.innerHTML = `
        <div style="flex: 1; overflow: hidden; padding-right: 8px;">
          <div class="batch-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h.name}</div>
          <div class="batch-meta">${formatBytesSafe(h.originalSize)} → <b>${formatBytesSafe(h.newSize)}</b> • ${h.durationSec || '0.1'}s</div>
        </div>
        <span class="savings-badge">-${h.savingsPercent || 0}%</span>
      `;
      historyList.appendChild(div);
    });
  }

  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
      if (FT.clearHistory) FT.clearHistory();
      renderHistory();
      showToast('History cleared');
    });
  }

});
