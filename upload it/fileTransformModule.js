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
    quality: CONFIG.QUALITY.HIGH
  };
  
  // If already valid, no transformations needed
  if (comparisonResult.isValid) {
    return plan;
  }
  
  // Step 1: Format Conversion (if needed)
  if (comparisonResult.requiredTransformations.includes('format-conversion')) {
    // Choose the first allowed format that we can convert to
    const allowedFormats = constraints.allowedFormats.map(f => f.toLowerCase());
    
    // Prefer PNG for lossless, JPG for lossy compression
    if (allowedFormats.includes('png')) {
      plan.targetFormat = 'png';
    } else if (allowedFormats.includes('jpg') || allowedFormats.includes('jpeg')) {
      plan.targetFormat = 'jpg';
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
  
  // Step 2: Resize (if needed)
  if (comparisonResult.requiredTransformations.includes('resize')) {
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
  if (comparisonResult.requiredTransformations.includes('compression')) {
    const maxBytes = parseSizeToBytes(constraints.maxSize);
    plan.targetSize = maxBytes;
    
    plan.steps.push({
      type: 'compression',
      targetSize: maxBytes
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
async function convertImageToPDF(img, originalName) {
  // For browser-based PDF generation, we'll create a simple PDF structure
  // This is a simplified implementation. For production, consider using jsPDF library
  
  // Create canvas with image
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Calculate dimensions to fit A4 with margins
  const maxWidth = CONFIG.PDF.A4_WIDTH - (CONFIG.PDF.MARGIN * 2);
  const maxHeight = CONFIG.PDF.A4_HEIGHT - (CONFIG.PDF.MARGIN * 2);
  
  let width = img.naturalWidth;
  let height = img.naturalHeight;
  
  // Scale to fit page
  const widthRatio = maxWidth / width;
  const heightRatio = maxHeight / height;
  const ratio = Math.min(widthRatio, heightRatio);
  
  width = width * ratio;
  height = height * ratio;
  
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);
  
  // Convert to high-quality image
  const imageBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Failed to create image')),
      'image/jpeg',
      0.95
    );
  });
  
  // Create simple PDF structure
  // Note: This is a basic implementation. For full PDF features, use a library
  const imageData = await readFileAsArrayBuffer(imageBlob);
  const base64Image = btoa(
    new Uint8Array(imageData).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );
  
  // Build minimal PDF structure
  const pdfContent = buildMinimalPDF(base64Image, width, height);
  
  return new Blob([pdfContent], { type: 'application/pdf' });
}

/**
 * Build a minimal PDF with embedded JPEG image
 * @param {string} base64Image - Base64 encoded image
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {string} PDF content
 */
function buildMinimalPDF(base64Image, width, height) {
  const pageWidth = CONFIG.PDF.A4_WIDTH;
  const pageHeight = CONFIG.PDF.A4_HEIGHT;
  const margin = CONFIG.PDF.MARGIN;
  
  const x = margin;
  const y = pageHeight - margin - height;
  
  // Build PDF structure (simplified)
  const pdf = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/XObject <<
/Im1 4 0 R
>>
>>
/MediaBox [0 0 ${pageWidth} ${pageHeight}]
/Contents 5 0 R
>>
endobj
4 0 obj
<<
/Type /XObject
/Subtype /Image
/Width ${Math.floor(width)}
/Height ${Math.floor(height)}
/ColorSpace /DeviceRGB
/BitsPerComponent 8
/Filter /DCTDecode
/Length ${base64Image.length}
>>
stream
${atob(base64Image)}
endstream
endobj
5 0 obj
<<
/Length 44
>>
stream
q
${width} 0 0 ${height} ${x} ${y} cm
/Im1 Do
Q
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000270 00000 n 
0000000${(470 + base64Image.length).toString().padStart(3, '0')} 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
${514 + base64Image.length}
%%EOF`;
  
  return pdf;
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
  
  // Use high-quality image rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Draw resized image
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
 * Compress image to target size using binary search
 * @param {HTMLImageElement} img - Image to compress
 * @param {number} targetSize - Target size in bytes
 * @param {string} format - Output format
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {Promise<Blob>} Compressed image blob
 */
async function compressImageToSize(img, targetSize, format, width, height) {
  // Only JPEG and WebP support quality parameter
  const supportsQuality = ['jpg', 'jpeg', 'webp'].includes(format);
  
  if (!supportsQuality) {
    // For PNG, we can't easily compress further without dimension reduction
    // Return as-is and let caller handle dimension reduction if needed
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
        CONFIG.MIME_TYPES[format],
        1.0
      );
    });
  }
  
  // Binary search for optimal quality
  let minQuality = CONFIG.QUALITY.MIN;
  let maxQuality = CONFIG.QUALITY.HIGH;
  let bestBlob = null;
  let iterations = 0;
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  
  while (iterations < CONFIG.BINARY_SEARCH.MAX_ITERATIONS) {
    const quality = (minQuality + maxQuality) / 2;
    
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error('Compression failed')),
        CONFIG.MIME_TYPES[format],
        quality
      );
    });
    
    const sizeDiff = blob.size / targetSize;
    
    // Check if within tolerance
    if (Math.abs(sizeDiff - 1) <= CONFIG.BINARY_SEARCH.TOLERANCE) {
      return blob;
    }
    
    // Update best blob if closer to target
    if (!bestBlob || Math.abs(blob.size - targetSize) < Math.abs(bestBlob.size - targetSize)) {
      if (blob.size <= targetSize) {
        bestBlob = blob;
      }
    }
    
    // Adjust quality range
    if (blob.size > targetSize) {
      maxQuality = quality;
    } else {
      minQuality = quality;
      bestBlob = blob; // This one is under size limit
    }
    
    iterations++;
    
    // If range is too small, break
    if (maxQuality - minQuality < 0.01) {
      break;
    }
  }
  
  // If we couldn't get under target size, try reducing dimensions
  if (!bestBlob || bestBlob.size > targetSize) {
    // Reduce dimensions by 10% and try again
    const newWidth = Math.floor(width * 0.9);
    const newHeight = Math.floor(height * 0.9);
    
    if (newWidth > 10 && newHeight > 10) {
      const reducedCanvas = document.createElement('canvas');
      reducedCanvas.width = newWidth;
      reducedCanvas.height = newHeight;
      const reducedCtx = reducedCanvas.getContext('2d');
      reducedCtx.drawImage(img, 0, 0, newWidth, newHeight);
      
      const reducedImg = await new Promise((resolve) => {
        const tempImg = new Image();
        tempImg.onload = () => resolve(tempImg);
        tempImg.src = reducedCanvas.toDataURL();
      });
      
      return compressImageToSize(reducedImg, targetSize, format, newWidth, newHeight);
    }
  }
  
  return bestBlob || new Blob([], { type: CONFIG.MIME_TYPES[format] });
}

/**
 * Compress file to meet size constraint
 * @param {File} file - File to compress
 * @param {number} targetSize - Target size in bytes
 * @param {string} format - Output format
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @returns {Promise<Blob>} Compressed blob
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
          // If we need to compress to specific size
          if (currentBlob.size > plan.targetSize) {
            currentBlob = await compressToTargetSize(
              blobToFile(currentBlob, file.name),
              plan.targetSize,
              currentFormat,
              currentWidth,
              currentHeight
            );
            appliedTransformations.push(`compression: ${formatBytes(file.size)} → ${formatBytes(currentBlob.size)}`);
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
  if (constraints.maxWidth && width > constraints.maxWidth) {
    issues.push(`Width ${width}px still exceeds maximum ${constraints.maxWidth}px`);
  }
  
  if (constraints.maxHeight && height > constraints.maxHeight) {
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

// ============================================================================
// EXPORTS
// ============================================================================

// Export main function and utilities
if (typeof module !== 'undefined' && module.exports) {
  // Node.js/CommonJS
  module.exports = {
    transformFile,
    analyzeMetadata,
    compareConstraints,
    parseSizeToBytes,
    formatBytes
  };
} else {
  // Browser/Global
  window.FileTransformModule = {
    transformFile,
    analyzeMetadata,
    compareConstraints,
    parseSizeToBytes,
    formatBytes
  };
}
