/**
 * ============================================================================
 * FILE TRANSFORMATION MODULE
 * ============================================================================
 * 
 * A comprehensive client-side file transformation system for browser extensions.
 * Handles format conversion, resizing, compression, and optimization entirely
 * in the browser without server dependencies.
 * 
 * @author Expert JavaScript Developer
 * @version 1.0.0
 */

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const CONFIG = {
  // Compression quality ranges
  QUALITY: {
    HIGH: 0.95,
    MEDIUM: 0.85,
    LOW: 0.75,
    MIN: 0.1,
    STEP: 0.05
  },
  
  // Binary search parameters for size optimization
  BINARY_SEARCH: {
    MAX_ITERATIONS: 15,
    TOLERANCE: 0.02 // 2% tolerance for target size
  },
  
  // Supported formats
  FORMATS: {
    IMAGE: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'],
    DOCUMENT: ['pdf'],
    CONVERTIBLE_TO_PDF: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']
  },
  
  // MIME type mappings
  MIME_TYPES: {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'pdf': 'application/pdf'
  },
  
  // Canvas limits (browser-dependent, conservative values)
  MAX_CANVAS_SIZE: 16384,
  
  // PDF generation settings
  PDF: {
    MARGIN: 40,
    DEFAULT_DPI: 72,
    A4_WIDTH: 595.28, // points
    A4_HEIGHT: 841.89 // points
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse size string to bytes
 * @param {string} sizeStr - Size string like "200KB", "1.5MB", "500000"
 * @returns {number} Size in bytes
 */
function parseSizeToBytes(sizeStr) {
  if (typeof sizeStr === 'number') return sizeStr;
  
  const units = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024
  };
  
  const match = String(sizeStr).match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match) throw new Error(`Invalid size format: ${sizeStr}`);
  
  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  
  return Math.floor(value * units[unit]);
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Extract file extension from filename
 * @param {string} filename - File name
 * @returns {string} Extension in lowercase
 */
function getFileExtension(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return ext;
}

/**
 * Detect file format from File object
 * @param {File} file - File object
 * @returns {string} Format extension
 */
function detectFileFormat(file) {
  // First try from MIME type
  const mimeToExt = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'application/pdf': 'pdf'
  };
  
  if (mimeToExt[file.type]) {
    return mimeToExt[file.type];
  }
  
  // Fallback to filename extension
  return getFileExtension(file.name);
}

/**
 * Create a new filename with different extension
 * @param {string} originalName - Original filename
 * @param {string} newExtension - New extension without dot
 * @returns {string} New filename
 */
function changeFileExtension(originalName, newExtension) {
  const nameParts = originalName.split('.');
  if (nameParts.length > 1) {
    nameParts.pop();
  }
  return `${nameParts.join('.')}.${newExtension}`;
}

/**
 * Load image from File object
 * @param {File} file - Image file
 * @returns {Promise<HTMLImageElement>} Loaded image
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Convert blob to File object
 * @param {Blob} blob - Blob to convert
 * @param {string} filename - Desired filename
 * @returns {File} File object
 */
function blobToFile(blob, filename) {
  return new File([blob], filename, { type: blob.type });
}

/**
 * Read file as ArrayBuffer
 * @param {File} file - File to read
 * @returns {Promise<ArrayBuffer>} File contents
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ============================================================================
// METADATA ANALYZER
// ============================================================================

/**
 * Extract comprehensive metadata from file
 * @param {File} file - File to analyze
 * @returns {Promise<Object>} Metadata object
 */
async function analyzeMetadata(file) {
  const format = detectFileFormat(file);
  const metadata = {
    name: file.name,
    size: file.size,
    type: file.type,
    format: format,
    lastModified: file.lastModified
  };
  
  // Extract image-specific metadata
  if (CONFIG.FORMATS.IMAGE.includes(format)) {
    try {
      const img = await loadImage(file);
      metadata.width = img.naturalWidth;
      metadata.height = img.naturalHeight;
      metadata.aspectRatio = img.naturalWidth / img.naturalHeight;
    } catch (error) {
      console.warn('Failed to extract image dimensions:', error);
      metadata.width = null;
      metadata.height = null;
      metadata.aspectRatio = null;
    }
  }
  
  return metadata;
}

// ============================================================================
// RULE COMPARATOR
// ============================================================================

/**
 * Compare file metadata against constraints
 * @param {Object} metadata - File metadata
 * @param {Object} constraints - Required constraints
 * @returns {Object} Violations and required transformations
 */
function compareConstraints(metadata, constraints) {
  const violations = [];
  const requiredTransformations = new Set();
  
  // Check file size
  if (constraints.maxSize) {
    const maxBytes = parseSizeToBytes(constraints.maxSize);
    if (metadata.size > maxBytes) {
      violations.push({
        type: 'size',
        current: metadata.size,
        required: maxBytes,
        message: `File size ${formatBytes(metadata.size)} exceeds maximum ${formatBytes(maxBytes)}`
      });
      requiredTransformations.add('compression');
    }
  }
  
  // Check allowed formats
  if (constraints.allowedFormats && constraints.allowedFormats.length > 0) {
    const normalizedAllowed = constraints.allowedFormats.map(f => f.toLowerCase());
    if (!normalizedAllowed.includes(metadata.format)) {
      violations.push({
        type: 'format',
        current: metadata.format,
        required: normalizedAllowed,
        message: `Format ${metadata.format} not in allowed formats: ${normalizedAllowed.join(', ')}`
      });
      requiredTransformations.add('format-conversion');
    }
  }
  
  // Check image dimensions
  if (metadata.width && metadata.height) {
    if (constraints.maxWidth && metadata.width > constraints.maxWidth) {
      violations.push({
        type: 'width',
        current: metadata.width,
        required: constraints.maxWidth,
        message: `Width ${metadata.width}px exceeds maximum ${constraints.maxWidth}px`
      });
      requiredTransformations.add('resize');
    }
    
    if (constraints.maxHeight && metadata.height > constraints.maxHeight) {
      violations.push({
        type: 'height',
        current: metadata.height,
        required: constraints.maxHeight,
        message: `Height ${metadata.height}px exceeds maximum ${constraints.maxHeight}px`
      });
      requiredTransformations.add('resize');
    }
    
    if (constraints.minWidth && metadata.width < constraints.minWidth) {
      violations.push({
        type: 'width',
        current: metadata.width,
        required: constraints.minWidth,
        message: `Width ${metadata.width}px below minimum ${constraints.minWidth}px`
      });
      requiredTransformations.add('resize');
    }
    
    if (constraints.minHeight && metadata.height < constraints.minHeight) {
      violations.push({
        type: 'height',
        current: metadata.height,
        required: constraints.minHeight,
        message: `Height ${metadata.height}px below minimum ${constraints.minHeight}px`
      });
      requiredTransformations.add('resize');
    }
  }
  
  return {
    isValid: violations.length === 0,
    violations,
    requiredTransformations: Array.from(requiredTransformations)
  };
}

// ============================================================================
// TRANSFORMATION PLANNER
// ============================================================================

/**
 * Create transformation plan based on violations
 * @param {Object} metadata - Current file metadata
 * @param {Object} constraints - Required constraints
 * @param {Object} comparisonResult - Result from compareConstraints
 * @returns {Object} Transformation plan
 */
function planTransformations(metadata, constraints, comparisonResult) {
  const plan = {
    steps: [],
    targetFormat: metadata.format,
    targetWidth: metadata.width,
    targetHeight: metadata.height,
    targetSize: metadata.size,
    quality: constraints && constraints.quality !== undefined ? Number(constraints.quality) : CONFIG.QUALITY.HIGH
  };
  
  // Explicit target format override if provided
  const explicitFormat = constraints.targetFormat || (constraints.allowedFormats && constraints.allowedFormats.length === 1 ? constraints.allowedFormats[0] : null);
  if (explicitFormat && explicitFormat.toLowerCase() !== metadata.format.toLowerCase()) {
    plan.targetFormat = explicitFormat.toLowerCase();
    plan.steps.push({
      type: 'format-conversion',
      from: metadata.format,
      to: plan.targetFormat
    });
  } else if (comparisonResult.requiredTransformations && comparisonResult.requiredTransformations.includes('format-conversion')) {
    // Choose the first allowed format that we can convert to
    const allowedFormats = constraints.allowedFormats.map(f => f.toLowerCase());
    
    // Prefer WebP > JPG > PNG > PDF
    if (allowedFormats.includes('webp')) {
      plan.targetFormat = 'webp';
    } else if (allowedFormats.includes('jpg') || allowedFormats.includes('jpeg')) {
      plan.targetFormat = 'jpg';
    } else if (allowedFormats.includes('png')) {
      plan.targetFormat = 'png';
    } else if (allowedFormats.includes('pdf')) {
      plan.targetFormat = 'pdf';
    } else {
      plan.targetFormat = allowedFormats[0];
    }
    
    plan.steps.push({
      type: 'format-conversion',
      from: metadata.format,
      to: plan.targetFormat
    });
  }

  // Handle explicit percentage scale if specified (e.g. scale: 0.5 for 50%)
  if (constraints.scale && Number(constraints.scale) > 0 && Number(constraints.scale) < 1.0 && metadata.width && metadata.height) {
    const scaledWidth = Math.max(16, Math.floor(metadata.width * Number(constraints.scale)));
    const scaledHeight = Math.max(16, Math.floor(metadata.height * Number(constraints.scale)));
    plan.targetWidth = scaledWidth;
    plan.targetHeight = scaledHeight;
    plan.steps.push({
      type: 'resize',
      from: { width: metadata.width, height: metadata.height },
      to: { width: scaledWidth, height: scaledHeight }
    });
  }
  
  // Step 2: Resize based on constraints (if needed)
  else if (comparisonResult.requiredTransformations && comparisonResult.requiredTransformations.includes('resize') && metadata.width && metadata.height) {
    let newWidth = metadata.width;
    let newHeight = metadata.height;
    
    // Calculate target dimensions while maintaining aspect ratio
    if (constraints.maxWidth && newWidth > constraints.maxWidth) {
      const ratio = constraints.maxWidth / newWidth;
      newWidth = constraints.maxWidth;
      newHeight = Math.floor(newHeight * ratio);
    }
    
    if (constraints.maxHeight && newHeight > constraints.maxHeight) {
      const ratio = constraints.maxHeight / newHeight;
      newHeight = constraints.maxHeight;
      newWidth = Math.floor(newWidth * ratio);
    }
    
    // Handle minimum dimensions (scale up if needed)
    if (constraints.minWidth && newWidth < constraints.minWidth) {
      const ratio = constraints.minWidth / newWidth;
      newWidth = constraints.minWidth;
      newHeight = Math.floor(newHeight * ratio);
    }
    
    if (constraints.minHeight && newHeight < constraints.minHeight) {
      const ratio = constraints.minHeight / newHeight;
      newHeight = constraints.minHeight;
      newWidth = Math.floor(newWidth * ratio);
    }
    
    plan.targetWidth = newWidth;
    plan.targetHeight = newHeight;
    
    plan.steps.push({
      type: 'resize',
      from: { width: metadata.width, height: metadata.height },
      to: { width: newWidth, height: newHeight }
    });
  }
  
  // Step 3: Compression (if needed for size constraint)
  if (comparisonResult.requiredTransformations && comparisonResult.requiredTransformations.includes('compression')) {
    const maxBytes = parseSizeToBytes(constraints.maxSize);
    plan.targetSize = maxBytes;
    
    plan.steps.push({
      type: 'compression',
      targetSize: maxBytes
    });
  } else if (constraints.quality && Number(constraints.quality) < 0.95 && ['jpg', 'jpeg', 'webp'].includes(plan.targetFormat)) {
    // If explicit lower quality requested without strict size target
    plan.steps.push({
      type: 'quality-adjust',
      quality: Number(constraints.quality)
    });
  }
  
  return plan;
}

// ============================================================================
// FORMAT CONVERTER
// ============================================================================

/**
 * Convert image to target format
 * @param {File} file - Source file
 * @param {string} targetFormat - Target format (jpg, png, webp, pdf)
 * @param {number} quality - Quality (0-1)
 * @returns {Promise<Blob>} Converted image blob
 */
async function convertImageFormat(file, targetFormat, quality = CONFIG.QUALITY.HIGH) {
  const img = await loadImage(file);
  
  // Special handling for PDF conversion
  if (targetFormat === 'pdf') {
    return await convertImageToPDF(img, file.name);
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  
  const mimeType = CONFIG.MIME_TYPES[targetFormat];
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert image format'));
        }
      },
      mimeType,
      quality
    );
  });
}

/**
 * Convert image to PDF using canvas
 * @param {HTMLImageElement} img - Image to convert
 * @param {string} originalName - Original filename
 * @returns {Promise<Blob>} PDF blob
 */
/**
 * Convert image to PDF using canvas
 * @param {HTMLImageElement} img - Image to convert
 * @param {string} originalName - Original filename
 * @returns {Promise<Blob>} PDF blob
 */
async function convertImageToPDF(img, originalName) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);
  
  // Convert to high-quality JPEG for embedding in PDF
  const imageBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Failed to create image for PDF')),
      'image/jpeg',
      0.95
    );
  });
  
  const imageData = await readFileAsArrayBuffer(imageBlob);
  const jpegBytes = new Uint8Array(imageData);
  
  const pdfBytes = buildMinimalPDF(jpegBytes, img.naturalWidth, img.naturalHeight);
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Build a valid minimal PDF with embedded JPEG image
 * @param {Uint8Array} jpegBytes - JPEG image binary data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} pageWidth - Page width in points (A4 default)
 * @param {number} pageHeight - Page height in points (A4 default)
 * @param {number} margin - Margin in points
 * @returns {Uint8Array} Binary PDF content
 */
function buildMinimalPDF(jpegBytes, width, height, pageWidth = CONFIG.PDF.A4_WIDTH, pageHeight = CONFIG.PDF.A4_HEIGHT, margin = CONFIG.PDF.MARGIN) {
  const maxWidth = pageWidth - (margin * 2);
  const maxHeight = pageHeight - (margin * 2);
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1.0);
  const renderWidth = width * ratio;
  const renderHeight = height * ratio;
  const x = margin + (maxWidth - renderWidth) / 2;
  const y = margin + (maxHeight - renderHeight) / 2;

  const encoder = new TextEncoder();
  
  const header = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`;
  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`;
  
  const obj4Head = `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.floor(width)} /Height ${Math.floor(height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`;
  const obj4Tail = `\nendstream\nendobj\n`;
  
  const contentStream = `q\n${renderWidth.toFixed(2)} 0 0 ${renderHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im1 Do\nQ\n`;
  const obj5 = `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`;

  const hBytes = encoder.encode(header);
  const o1Bytes = encoder.encode(obj1);
  const o2Bytes = encoder.encode(obj2);
  const o3Bytes = encoder.encode(obj3);
  const o4HBytes = encoder.encode(obj4Head);
  const o4TBytes = encoder.encode(obj4Tail);
  const o5Bytes = encoder.encode(obj5);

  const offset1 = hBytes.length;
  const offset2 = offset1 + o1Bytes.length;
  const offset3 = offset2 + o2Bytes.length;
  const offset4 = offset3 + o3Bytes.length;
  const offset5 = offset4 + o4HBytes.length + jpegBytes.length + o4TBytes.length;
  const xrefOffset = offset5 + o5Bytes.length;

  function pad(num) {
    return String(num).padStart(10, '0');
  }

  const xref = `xref\n0 6\n0000000000 65535 f \r\n${pad(offset1)} 00000 n \r\n${pad(offset2)} 00000 n \r\n${pad(offset3)} 00000 n \r\n${pad(offset4)} 00000 n \r\n${pad(offset5)} 00000 n \r\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const xrefBytes = encoder.encode(xref);

  const totalLength = xrefOffset + xrefBytes.length;
  const pdfBytes = new Uint8Array(totalLength);
  
  let pos = 0;
  pdfBytes.set(hBytes, pos); pos += hBytes.length;
  pdfBytes.set(o1Bytes, pos); pos += o1Bytes.length;
  pdfBytes.set(o2Bytes, pos); pos += o2Bytes.length;
  pdfBytes.set(o3Bytes, pos); pos += o3Bytes.length;
  pdfBytes.set(o4HBytes, pos); pos += o4HBytes.length;
  pdfBytes.set(jpegBytes, pos); pos += jpegBytes.length;
  pdfBytes.set(o4TBytes, pos); pos += o4TBytes.length;
  pdfBytes.set(o5Bytes, pos); pos += o5Bytes.length;
  pdfBytes.set(xrefBytes, pos);

  return pdfBytes;
}

// ============================================================================
// IMAGE RESIZER
// ============================================================================

/**
 * Resize image to target dimensions
 * @param {File} file - Source image file
 * @param {number} targetWidth - Target width
 * @param {number} targetHeight - Target height
 * @param {string} format - Output format
 * @param {number} quality - Quality (0-1)
 * @returns {Promise<Blob>} Resized image blob
 */
async function resizeImage(file, targetWidth, targetHeight, format, quality = CONFIG.QUALITY.HIGH) {
  const img = await loadImage(file);
  
  // Validate canvas size limits
  if (targetWidth > CONFIG.MAX_CANVAS_SIZE || targetHeight > CONFIG.MAX_CANVAS_SIZE) {
    throw new Error(`Target dimensions exceed browser canvas limits (${CONFIG.MAX_CANVAS_SIZE}px)`);
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  
  const mimeType = CONFIG.MIME_TYPES[format] || CONFIG.MIME_TYPES['png'];
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to resize image'));
        }
      },
      mimeType,
      quality
    );
  });
}

// ============================================================================
// IMAGE COMPRESSOR
// ============================================================================

/**
 * Helper to render an image onto a canvas and return blob
 */
function renderImageToBlob(img, format, quality, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  
  const mimeType = CONFIG.MIME_TYPES[format] || CONFIG.MIME_TYPES['jpg'];
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas rendering failed')),
      mimeType,
      quality
    );
  });
}

/**
 * Compress image to target size using binary search and dimension fallback
 * @param {HTMLImageElement} img - Image to compress
 * @param {number} targetSize - Target size in bytes
 * @param {string} format - Output format
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {Promise<{blob: Blob, width: number, height: number}>} Result
 */
async function compressImageToSize(img, targetSize, format, width, height) {
  const supportsQuality = ['jpg', 'jpeg', 'webp'].includes(format);
  let currentWidth = width;
  let currentHeight = height;
  
  if (!supportsQuality) {
    // For lossless formats (PNG, etc.), iteratively scale down dimensions to meet target size
    let bestBlob = await renderImageToBlob(img, format, 1.0, currentWidth, currentHeight);
    
    let scale = 0.88;
    while (bestBlob.size > targetSize && currentWidth > 16 && currentHeight > 16) {
      currentWidth = Math.max(16, Math.floor(currentWidth * scale));
      currentHeight = Math.max(16, Math.floor(currentHeight * scale));
      bestBlob = await renderImageToBlob(img, format, 1.0, currentWidth, currentHeight);
    }
    
    return { blob: bestBlob, width: currentWidth, height: currentHeight };
  }
  
  // Binary search for optimal quality
  let minQuality = CONFIG.QUALITY.MIN;
  let maxQuality = CONFIG.QUALITY.HIGH;
  let bestBlob = null;
  let iterations = 0;
  
  while (iterations < CONFIG.BINARY_SEARCH.MAX_ITERATIONS) {
    const quality = (minQuality + maxQuality) / 2;
    const blob = await renderImageToBlob(img, format, quality, currentWidth, currentHeight);
    const sizeDiff = blob.size / targetSize;
    
    // Check if within tolerance
    if (Math.abs(sizeDiff - 1) <= CONFIG.BINARY_SEARCH.TOLERANCE) {
      return { blob, width: currentWidth, height: currentHeight };
    }
    
    if (blob.size <= targetSize) {
      bestBlob = blob;
      minQuality = quality;
    } else {
      maxQuality = quality;
    }
    
    iterations++;
    if (maxQuality - minQuality < 0.01) break;
  }
  
  // If lowest quality still exceeds target size, reduce dimensions iteratively
  if (!bestBlob || bestBlob.size > targetSize) {
    let scale = 0.85;
    while (currentWidth > 16 && currentHeight > 16) {
      currentWidth = Math.max(16, Math.floor(currentWidth * scale));
      currentHeight = Math.max(16, Math.floor(currentHeight * scale));
      const blob = await renderImageToBlob(img, format, CONFIG.QUALITY.LOW, currentWidth, currentHeight);
      if (blob.size <= targetSize) {
        return { blob, width: currentWidth, height: currentHeight };
      }
      bestBlob = blob;
    }
  }
  
  return { 
    blob: bestBlob || await renderImageToBlob(img, format, CONFIG.QUALITY.MIN, currentWidth, currentHeight),
    width: currentWidth, 
    height: currentHeight 
  };
}

/**
 * Compress file to meet size constraint
 * @param {File} file - File to compress
 * @param {number} targetSize - Target size in bytes
 * @param {string} format - Output format
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @returns {Promise<{blob: Blob, width: number, height: number}>} Compressed result
 */
async function compressToTargetSize(file, targetSize, format, width, height) {
  const img = await loadImage(file);
  return compressImageToSize(img, targetSize, format, width, height);
}

// ============================================================================
// EXECUTION PIPELINE
// ============================================================================

/**
 * Execute transformation plan
 * @param {File} file - Source file
 * @param {Object} plan - Transformation plan
 * @param {Object} metadata - Original metadata
 * @returns {Promise<Object>} Transformation result
 */
async function executeTransformations(file, plan, metadata) {
  let currentBlob = file;
  let currentFormat = metadata.format;
  let currentWidth = metadata.width;
  let currentHeight = metadata.height;
  const appliedTransformations = [];
  
  // If no transformations needed
  if (plan.steps.length === 0) {
    return {
      blob: file,
      format: currentFormat,
      width: currentWidth,
      height: currentHeight,
      appliedTransformations: []
    };
  }
  
  // Execute each step in sequence
  for (const step of plan.steps) {
    try {
      switch (step.type) {
        case 'format-conversion':
          currentBlob = await convertImageFormat(
            blobToFile(currentBlob, file.name),
            plan.targetFormat,
            plan.quality
          );
          currentFormat = plan.targetFormat;
          appliedTransformations.push(`format-conversion: ${step.from} → ${step.to}`);
          break;
          
        case 'resize':
          currentBlob = await resizeImage(
            blobToFile(currentBlob, file.name),
            plan.targetWidth,
            plan.targetHeight,
            currentFormat,
            plan.quality
          );
          currentWidth = plan.targetWidth;
          currentHeight = plan.targetHeight;
          appliedTransformations.push(`resize: ${step.from.width}x${step.from.height} → ${step.to.width}x${step.to.height}`);
          break;
          
        case 'compression':
          if (currentBlob.size > plan.targetSize) {
            const sizeBefore = currentBlob.size;
            const compResult = await compressToTargetSize(
              blobToFile(currentBlob, file.name),
              plan.targetSize,
              currentFormat,
              currentWidth,
              currentHeight
            );
            currentBlob = compResult.blob;
            currentWidth = compResult.width;
            currentHeight = compResult.height;
            appliedTransformations.push(`compression: ${formatBytes(sizeBefore)} → ${formatBytes(currentBlob.size)}`);
          }
          break;
      }
    } catch (error) {
      console.error(`Transformation step failed: ${step.type}`, error);
      throw new Error(`Failed to execute ${step.type}: ${error.message}`);
    }
  }
  
  return {
    blob: currentBlob,
    format: currentFormat,
    width: currentWidth,
    height: currentHeight,
    appliedTransformations
  };
}

// ============================================================================
// VALIDATOR
// ============================================================================

/**
 * Validate final result against constraints
 * @param {Blob} blob - Final blob
 * @param {Object} constraints - Required constraints
 * @param {number} width - Final width
 * @param {number} height - Final height
 * @param {string} format - Final format
 * @returns {Object} Validation result
 */
function validateResult(blob, constraints, width, height, format) {
  const issues = [];
  
  // Check size
  if (constraints.maxSize) {
    const maxBytes = parseSizeToBytes(constraints.maxSize);
    if (blob.size > maxBytes) {
      issues.push(`Size ${formatBytes(blob.size)} still exceeds maximum ${formatBytes(maxBytes)}`);
    }
  }
  
  // Check format
  if (constraints.allowedFormats && constraints.allowedFormats.length > 0) {
    const normalizedAllowed = constraints.allowedFormats.map(f => f.toLowerCase());
    if (!normalizedAllowed.includes(format)) {
      issues.push(`Format ${format} not in allowed formats: ${normalizedAllowed.join(', ')}`);
    }
  }
  
  // Check dimensions
  if (constraints.maxWidth && width && width > constraints.maxWidth) {
    issues.push(`Width ${width}px still exceeds maximum ${constraints.maxWidth}px`);
  }
  
  if (constraints.maxHeight && height && height > constraints.maxHeight) {
    issues.push(`Height ${height}px still exceeds maximum ${constraints.maxHeight}px`);
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

// ============================================================================
// MAIN TRANSFORMATION FUNCTION
// ============================================================================

/**
 * Transform file to meet constraints
 * @param {File} file - Input file
 * @param {Object} constraints - Transformation constraints
 * @returns {Promise<Object>} Transformation result
 */
async function transformFile(file, constraints) {
  try {
    // Step 1: Analyze metadata
    const originalMetadata = await analyzeMetadata(file);
    
    // Step 2: Compare against constraints
    const comparisonResult = compareConstraints(originalMetadata, constraints);
    
    // Step 3: Plan transformations
    const plan = planTransformations(originalMetadata, constraints, comparisonResult);
    
    // Step 4: Execute transformations
    const executionResult = await executeTransformations(file, plan, originalMetadata);
    
    // Step 5: Create output file
    const newFilename = changeFileExtension(file.name, executionResult.format);
    const transformedFile = blobToFile(executionResult.blob, newFilename);
    
    // Step 6: Analyze new metadata
    const newMetadata = await analyzeMetadata(transformedFile);
    
    // Step 7: Validate result
    const validation = validateResult(
      executionResult.blob,
      constraints,
      executionResult.width,
      executionResult.height,
      executionResult.format
    );
    
    // Return comprehensive result
    return {
      success: validation.isValid,
      transformedFile,
      originalMetadata,
      newMetadata,
      transformationsApplied: executionResult.appliedTransformations,
      validation,
      plan
    };
    
  } catch (error) {
    console.error('File transformation error:', error);
    throw new Error(`Transformation failed: ${error.message}`);
  }
}

/**
 * Convert Blob or File to Base64 / Data URL
 * @param {Blob|File} blob - Blob to convert
 * @returns {Promise<string>} Base64 Data URL
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

const moduleExports = {
  CONFIG,
  transformFile,
  analyzeMetadata,
  compareConstraints,
  planTransformations,
  executeTransformations,
  validateResult,
  convertImageFormat,
  convertImageToPDF,
  buildMinimalPDF,
  resizeImage,
  compressImageToSize,
  compressToTargetSize,
  parseSizeToBytes,
  formatBytes,
  detectFileFormat,
  getFileExtension,
  changeFileExtension,
  blobToFile,
  blobToBase64
};

// Export main function and utilities
if (typeof module !== 'undefined' && module.exports) {
  // Node.js/CommonJS
  module.exports = moduleExports;
}

if (typeof window !== 'undefined') {
  // Browser/Global
  window.FileTransformModule = {
    ...(window.FileTransformModule || {}),
    ...moduleExports
  };
}

