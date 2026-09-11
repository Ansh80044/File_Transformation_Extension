/**
 * ============================================================================
 * UTILITY HELPER FUNCTIONS
 * ============================================================================
 * 
 * Additional utilities for advanced file transformation scenarios
 */

// Dependency resolution (Node.js, CommonJS, and Browser globals)
let transformFileFn, parseSizeToBytesFn, formatBytesFn, analyzeMetadataFn, compareConstraintsFn;

if (typeof require !== 'undefined') {
  try {
    const mainMod = require('./fileTransformModule');
    transformFileFn = mainMod.transformFile;
    parseSizeToBytesFn = mainMod.parseSizeToBytes;
    formatBytesFn = mainMod.formatBytes;
    analyzeMetadataFn = mainMod.analyzeMetadata;
    compareConstraintsFn = mainMod.compareConstraints;
  } catch (e) {}
}

function getHelper(name) {
  if (typeof window !== 'undefined' && window.FileTransformModule && typeof window.FileTransformModule[name] === 'function') {
    return window.FileTransformModule[name];
  }
  if (name === 'transformFile') return transformFileFn || (typeof transformFile === 'function' ? transformFile : null);
  if (name === 'parseSizeToBytes') return parseSizeToBytesFn || (typeof parseSizeToBytes === 'function' ? parseSizeToBytes : null);
  if (name === 'formatBytes') return formatBytesFn || (typeof formatBytes === 'function' ? formatBytes : null);
  if (name === 'analyzeMetadata') return analyzeMetadataFn || (typeof analyzeMetadata === 'function' ? analyzeMetadata : null);
  if (name === 'compareConstraints') return compareConstraintsFn || (typeof compareConstraints === 'function' ? compareConstraints : null);
  return null;
}

/**
 * Batch transform multiple files
 * @param {File[]} files - Array of files to transform
 * @param {Object} constraints - Constraints to apply to all files
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<Object[]>} Array of transformation results
 */
async function batchTransformFiles(files, constraints, progressCallback = null) {
  const results = [];
  const transform = getHelper('transformFile');
  if (!transform) {
    throw new Error('transformFile function is not available.');
  }
  
  for (let i = 0; i < files.length; i++) {
    try {
      const result = await transform(files[i], constraints);
      results.push({
        ...result,
        originalFile: files[i]
      });
      
      if (progressCallback) {
        progressCallback({
          completed: i + 1,
          total: files.length,
          percentage: ((i + 1) / files.length) * 100,
          currentFile: files[i].name
        });
      }
    } catch (error) {
      results.push({
        success: false,
        error: error.message,
        originalFile: files[i]
      });
    }
  }
  
  return results;
}

/**
 * Create a download link for transformed file
 * @param {File|Blob} file - File or Blob to download
 * @param {string} linkText - Text for download link
 * @returns {HTMLAnchorElement} Download link element
 */
function createDownloadLink(file, linkText = 'Download') {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name || 'transformed-file';
  link.textContent = linkText;
  link.className = 'download-link';
  
  // Cleanup on click
  link.addEventListener('click', () => {
    setTimeout(() => URL.revokeObjectURL(url), 200);
  });
  
  return link;
}

/**
 * Get optimal format for given constraints
 * @param {Object} constraints - Transformation constraints
 * @param {string} currentFormat - Current file format
 * @returns {string} Recommended format
 */
function getOptimalFormat(constraints, currentFormat) {
  if (!constraints || !constraints.allowedFormats || constraints.allowedFormats.length === 0) {
    return currentFormat;
  }
  
  const allowed = constraints.allowedFormats.map(f => f.toLowerCase());
  
  // If current format is allowed, keep it
  if (allowed.includes(currentFormat.toLowerCase())) {
    return currentFormat.toLowerCase();
  }
  
  // Preference order: png (lossless) > jpg (lossy but smaller) > webp > pdf
  const preferenceOrder = ['png', 'jpg', 'jpeg', 'webp', 'pdf'];
  
  for (const format of preferenceOrder) {
    if (allowed.includes(format)) {
      return format;
    }
  }
  
  // Fallback to first allowed format
  return allowed[0];
}

/**
 * Estimate final file size after transformations
 * @param {Object} metadata - File metadata
 * @param {Object} plan - Transformation plan
 * @returns {number} Estimated size in bytes
 */
function estimateFinalSize(metadata, plan) {
  let estimatedSize = (metadata && metadata.size) ? metadata.size : 0;
  if (!plan || !plan.steps) return Math.floor(estimatedSize);
  
  // Rough estimation based on transformation steps
  for (const step of plan.steps) {
    switch (step.type) {
      case 'format-conversion':
        // PNG is typically 2-3x larger than JPG for photos
        if (step.to === 'png' && (step.from === 'jpg' || step.from === 'jpeg')) {
          estimatedSize *= 2.5;
        } else if ((step.to === 'jpg' || step.to === 'jpeg') && step.from === 'png') {
          estimatedSize *= 0.4;
        } else if (step.to === 'webp') {
          estimatedSize *= 0.35;
        }
        break;
        
      case 'resize':
        if (step.from && step.from.width && step.from.height && step.to && step.to.width && step.to.height) {
          const originalPixels = step.from.width * step.from.height;
          const newPixels = step.to.width * step.to.height;
          if (originalPixels > 0) {
            estimatedSize *= (newPixels / originalPixels);
          }
        }
        break;
        
      case 'compression':
        if (step.targetSize) {
          estimatedSize = Math.min(estimatedSize, step.targetSize);
        }
        break;
    }
  }
  
  return Math.floor(estimatedSize);
}

/**
 * Calculate optimal dimensions for target aspect ratio
 * @param {number} currentWidth - Current width
 * @param {number} currentHeight - Current height
 * @param {number} targetAspectRatio - Target aspect ratio (width/height)
 * @param {string} mode - 'fit' (shrink to fit) or 'fill' (expand to fill)
 * @returns {Object} Optimal dimensions
 */
function calculateAspectRatioDimensions(currentWidth, currentHeight, targetAspectRatio, mode = 'fit') {
  const currentAspectRatio = currentWidth / currentHeight;
  
  let newWidth, newHeight;
  
  if (mode === 'fit') {
    // Shrink to fit target aspect ratio
    if (currentAspectRatio > targetAspectRatio) {
      // Image is wider than target
      newHeight = currentHeight;
      newWidth = Math.floor(newHeight * targetAspectRatio);
    } else {
      // Image is taller than target
      newWidth = currentWidth;
      newHeight = Math.floor(newWidth / targetAspectRatio);
    }
  } else {
    // Expand to fill target aspect ratio
    if (currentAspectRatio > targetAspectRatio) {
      // Image is wider than target
      newWidth = currentWidth;
      newHeight = Math.floor(newWidth / targetAspectRatio);
    } else {
      // Image is taller than target
      newHeight = currentHeight;
      newWidth = Math.floor(newHeight * targetAspectRatio);
    }
  }
  
  return { width: newWidth, height: newHeight };
}

/**
 * Validate constraints object
 * @param {Object} constraints - Constraints to validate
 * @returns {Object} Validation result with normalized constraints
 */
function validateConstraints(constraints) {
  const errors = [];
  if (!constraints || typeof constraints !== 'object') {
    return { isValid: false, errors: ['Constraints must be a valid object'], normalized: {} };
  }
  
  const normalized = { ...constraints };
  const parseSize = getHelper('parseSizeToBytes');
  
  // Validate maxSize
  if (constraints.maxSize !== undefined && constraints.maxSize !== null && constraints.maxSize !== '') {
    if (parseSize) {
      try {
        normalized.maxSize = parseSize(constraints.maxSize);
      } catch (error) {
        errors.push(`Invalid maxSize: ${error.message}`);
      }
    } else if (typeof constraints.maxSize === 'number') {
      normalized.maxSize = constraints.maxSize;
    } else {
      errors.push('parseSizeToBytes helper is not available to parse maxSize string.');
    }
  }
  
  // Validate allowedFormats
  if (constraints.allowedFormats) {
    if (!Array.isArray(constraints.allowedFormats)) {
      errors.push('allowedFormats must be an array');
    } else {
      const validFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'pdf'];
      const invalid = constraints.allowedFormats.filter(
        f => !validFormats.includes(String(f).toLowerCase())
      );
      if (invalid.length > 0) {
        errors.push(`Invalid formats: ${invalid.join(', ')}`);
      }
      normalized.allowedFormats = constraints.allowedFormats.map(f => String(f).toLowerCase());
    }
  }
  
  // Validate dimensions
  const dimensionFields = ['maxWidth', 'maxHeight', 'minWidth', 'minHeight'];
  for (const field of dimensionFields) {
    if (constraints[field] !== undefined && constraints[field] !== null && constraints[field] !== '') {
      const value = Number(constraints[field]);
      if (isNaN(value) || value <= 0) {
        errors.push(`${field} must be a positive number`);
      }
      normalized[field] = value;
    }
  }
  
  // Check logical constraints
  if (normalized.minWidth && normalized.maxWidth && normalized.minWidth > normalized.maxWidth) {
    errors.push('minWidth cannot be greater than maxWidth');
  }
  
  if (normalized.minHeight && normalized.maxHeight && normalized.minHeight > normalized.maxHeight) {
    errors.push('minHeight cannot be greater than maxHeight');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    normalized
  };
}

/**
 * Generate transformation summary report
 * @param {Object} result - Transformation result
 * @returns {string} Human-readable summary
 */
function generateTransformationReport(result) {
  const lines = [];
  const formatB = getHelper('formatBytes') || ((b) => `${b} B`);
  
  lines.push('=== File Transformation Report ===\n');
  
  if (result.originalMetadata) {
    lines.push('Original File:');
    lines.push(`  Name: ${result.originalMetadata.name}`);
    lines.push(`  Size: ${formatB(result.originalMetadata.size)}`);
    lines.push(`  Format: ${String(result.originalMetadata.format || '').toUpperCase()}`);
    if (result.originalMetadata.width) {
      lines.push(`  Dimensions: ${result.originalMetadata.width} x ${result.originalMetadata.height}px`);
    }
  }
  
  if (result.newMetadata) {
    lines.push('\nTransformed File:');
    lines.push(`  Name: ${result.newMetadata.name}`);
    lines.push(`  Size: ${formatB(result.newMetadata.size)}`);
    lines.push(`  Format: ${String(result.newMetadata.format || '').toUpperCase()}`);
    if (result.newMetadata.width) {
      lines.push(`  Dimensions: ${result.newMetadata.width} x ${result.newMetadata.height}px`);
    }
  }
  
  if (result.transformationsApplied && result.transformationsApplied.length > 0) {
    lines.push('\nTransformations Applied:');
    result.transformationsApplied.forEach((transform, i) => {
      lines.push(`  ${i + 1}. ${transform}`);
    });
  } else {
    lines.push('\nNo transformations needed - file already meets constraints');
  }
  
  lines.push(`\nValidation: ${result.success ? '✓ PASSED' : '✗ FAILED'}`);
  if (!result.success && result.validation && result.validation.issues && result.validation.issues.length > 0) {
    lines.push('Issues:');
    result.validation.issues.forEach(issue => {
      lines.push(`  - ${issue}`);
    });
  }
  
  if (result.originalMetadata && result.newMetadata) {
    const sizeReduction = result.originalMetadata.size - result.newMetadata.size;
    const reductionPercent = (sizeReduction / result.originalMetadata.size) * 100;
    
    if (sizeReduction > 0) {
      lines.push(`\nSize Reduction: ${formatB(sizeReduction)} (${reductionPercent.toFixed(1)}%)`);
    } else if (sizeReduction < 0) {
      lines.push(`\nSize Increase: ${formatB(Math.abs(sizeReduction))} (${Math.abs(reductionPercent).toFixed(1)}%)`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Compare two files
 * @param {File} file1 - First file
 * @param {File} file2 - Second file
 * @returns {Promise<Object>} Comparison result
 */
async function compareFiles(file1, file2) {
  const analyze = getHelper('analyzeMetadata');
  if (!analyze) {
    throw new Error('analyzeMetadata function is not available.');
  }
  
  const [meta1, meta2] = await Promise.all([
    analyze(file1),
    analyze(file2)
  ]);
  
  return {
    sizeDifference: meta2.size - meta1.size,
    sizeChangePercent: ((meta2.size - meta1.size) / meta1.size) * 100,
    formatChanged: meta1.format !== meta2.format,
    dimensionsChanged: meta1.width !== meta2.width || meta1.height !== meta2.height,
    file1: meta1,
    file2: meta2
  };
}

/**
 * Create a preset constraint object
 * @param {string} presetName - Name of preset
 * @returns {Object|null} Constraint object
 */
function getConstraintPreset(presetName) {
  const presets = {
    'web-optimized': {
      maxSize: '500KB',
      allowedFormats: ['jpg', 'webp'],
      maxWidth: 1920,
      maxHeight: 1080
    },
    'thumbnail': {
      maxSize: '50KB',
      allowedFormats: ['jpg'],
      maxWidth: 200,
      maxHeight: 200
    },
    'email-attachment': {
      maxSize: '1MB',
      allowedFormats: ['jpg', 'png', 'pdf'],
      maxWidth: 1200,
      maxHeight: 1200
    },
    'mobile-upload': {
      maxSize: '300KB',
      allowedFormats: ['jpg'],
      maxWidth: 1080,
      maxHeight: 1920
    },
    'profile-picture': {
      maxSize: '100KB',
      allowedFormats: ['jpg', 'png'],
      maxWidth: 500,
      maxHeight: 500
    },
    'document-scan': {
      maxSize: '2MB',
      allowedFormats: ['pdf'],
      maxWidth: 2480, // 300 DPI at 8.27 inches (A4 width)
      maxHeight: 3508 // 300 DPI at 11.69 inches (A4 height)
    }
  };
  
  return presets[presetName] || null;
}

/**
 * Detect if file needs transformation
 * @param {File} file - File to check
 * @param {Object} constraints - Constraints to check against
 * @returns {Promise<boolean>} True if transformation needed
 */
async function needsTransformation(file, constraints) {
  const analyze = getHelper('analyzeMetadata');
  const compare = getHelper('compareConstraints');
  if (!analyze || !compare) {
    throw new Error('Required metadata analysis functions not available.');
  }
  const metadata = await analyze(file);
  const comparison = compare(metadata, constraints);
  return !comparison.isValid;
}

const utilityExports = {
  batchTransformFiles,
  createDownloadLink,
  getOptimalFormat,
  estimateFinalSize,
  calculateAspectRatioDimensions,
  validateConstraints,
  generateTransformationReport,
  compareFiles,
  getConstraintPreset,
  needsTransformation
};

// Export utilities for Node.js / CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = utilityExports;
}

// Export utilities for Browser globals
if (typeof window !== 'undefined') {
  window.FileTransformUtilities = {
    ...(window.FileTransformUtilities || {}),
    ...utilityExports
  };
  // Also attach to window.FileTransformModule for developer ergonomics
  window.FileTransformModule = {
    ...(window.FileTransformModule || {}),
    ...utilityExports
  };
}
