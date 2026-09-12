const assert = require('assert');
const fs = require('fs');
const path = require('path');

const mod = require('./fileTransformModule.js');
const utils = require('./transformUtilities.js');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`  Error: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
    failCount++;
  }
}

async function runAllTests() {
  console.log('=== RUNNING FILE TRANSFORMER TEST SUITE ===\n');

  // 1. parseSizeToBytes
  test('parseSizeToBytes - valid formats & case-insensitivity', () => {
    assert.strictEqual(mod.parseSizeToBytes(204800), 204800);
    assert.strictEqual(mod.parseSizeToBytes('200KB'), 204800);
    assert.strictEqual(mod.parseSizeToBytes('200kb'), 204800);
    assert.strictEqual(mod.parseSizeToBytes('1.5MB'), 1572864);
    assert.strictEqual(mod.parseSizeToBytes('1GB'), 1073741824);
    assert.strictEqual(mod.parseSizeToBytes('500000'), 500000);
    assert.strictEqual(mod.parseSizeToBytes('500 B'), 500);
    assert.strictEqual(mod.parseSizeToBytes('0MB'), 0);
  });

  test('parseSizeToBytes - invalid formats throw descriptive errors', () => {
    assert.throws(() => mod.parseSizeToBytes('invalid'), /Invalid size format/);
    assert.throws(() => mod.parseSizeToBytes(''), /Invalid size format/);
    assert.throws(() => mod.parseSizeToBytes('abcMB'), /Invalid size format/);
  });

  // 2. formatBytes
  test('formatBytes - various sizes & zero boundary', () => {
    assert.strictEqual(mod.formatBytes(0), '0 B');
    assert.strictEqual(mod.formatBytes(500), '500.00 B');
    assert.strictEqual(mod.formatBytes(1024), '1.00 KB');
    assert.strictEqual(mod.formatBytes(1048576), '1.00 MB');
    assert.strictEqual(mod.formatBytes(1073741824), '1.00 GB');
  });

  // 3. getFileExtension, changeFileExtension, detectFileFormat
  test('file extension helpers', () => {
    assert.strictEqual(mod.getFileExtension('photo.JPG'), 'jpg');
    assert.strictEqual(mod.getFileExtension('archive.tar.gz'), 'gz');
    assert.strictEqual(mod.changeFileExtension('photo.png', 'jpg'), 'photo.jpg');
    assert.strictEqual(mod.changeFileExtension('archive.tar.gz', 'webp'), 'archive.tar.webp');
    assert.strictEqual(mod.detectFileFormat({ name: 'doc.pdf', type: 'application/pdf' }), 'pdf');
    assert.strictEqual(mod.detectFileFormat({ name: 'img.webp', type: 'image/webp' }), 'webp');
    assert.strictEqual(mod.detectFileFormat({ name: 'unknown.custom', type: '' }), 'custom');
  });

  // 4. validateConstraints
  test('validateConstraints - valid constraints', () => {
    const res = utils.validateConstraints({
      maxSize: '500KB',
      allowedFormats: ['JPG', 'png'],
      maxWidth: 1920,
      maxHeight: 1080
    });
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.errors.length, 0);
    assert.strictEqual(res.normalized.maxSize, 512000);
    assert.deepStrictEqual(res.normalized.allowedFormats, ['jpg', 'png']);
  });

  test('validateConstraints - handles empty & null constraints gracefully', () => {
    const res = utils.validateConstraints({});
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.errors.length, 0);
  });

  test('validateConstraints - invalid constraints caught', () => {
    const res = utils.validateConstraints({
      maxSize: 'bad_size',
      allowedFormats: 'not-an-array',
      minWidth: 2000,
      maxWidth: 1000,
      minHeight: 1500,
      maxHeight: 500
    });
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.length >= 4, `Expected >= 4 errors, got ${res.errors.length}`);
  });

  // 5. compareConstraints
  test('compareConstraints - violations detection and plan flags', () => {
    const meta = {
      name: 'photo.png',
      size: 2 * 1024 * 1024,
      format: 'png',
      width: 4000,
      height: 3000
    };
    const constraints = {
      maxSize: '500KB',
      allowedFormats: ['jpg', 'webp'],
      maxWidth: 1920,
      maxHeight: 1080
    };
    const res = mod.compareConstraints(meta, constraints);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.requiredTransformations.includes('compression'));
    assert.ok(res.requiredTransformations.includes('format-conversion'));
    assert.ok(res.requiredTransformations.includes('resize'));
    assert.strictEqual(res.violations.length, 4);
  });

  test('compareConstraints - compliant file passes', () => {
    const meta = {
      name: 'banner.jpg',
      size: 100 * 1024,
      format: 'jpg',
      width: 1200,
      height: 800
    };
    const constraints = {
      maxSize: '500KB',
      allowedFormats: ['jpg', 'webp'],
      maxWidth: 1920,
      maxHeight: 1080
    };
    const res = mod.compareConstraints(meta, constraints);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.violations.length, 0);
    assert.strictEqual(res.requiredTransformations.length, 0);
  });

  // 6. planTransformations
  test('planTransformations - builds correct transformation steps', () => {
    const meta = { name: 'photo.png', size: 3000000, format: 'png', width: 4000, height: 2000 };
    const constraints = { maxSize: '500KB', allowedFormats: ['jpg'], maxWidth: 2000, maxHeight: 1000 };
    const comp = mod.compareConstraints(meta, constraints);
    const plan = mod.planTransformations(meta, constraints, comp);
    
    assert.strictEqual(plan.targetFormat, 'jpg');
    assert.strictEqual(plan.targetWidth, 2000);
    assert.strictEqual(plan.targetHeight, 1000);
    assert.strictEqual(plan.targetSize, 512000);
    assert.strictEqual(plan.steps.length, 3);
    assert.strictEqual(plan.steps[0].type, 'format-conversion');
    assert.strictEqual(plan.steps[1].type, 'resize');
    assert.strictEqual(plan.steps[2].type, 'compression');
  });

  // 7. validateResult
  test('validateResult - checks size, format, and dimensions', () => {
    const fakeBlob = { size: 400000 };
    const valid = mod.validateResult(fakeBlob, { maxSize: '500KB', maxWidth: 1920, allowedFormats: ['jpg'] }, 1200, 800, 'jpg');
    assert.strictEqual(valid.isValid, true);
    assert.strictEqual(valid.issues.length, 0);

    const invalid = mod.validateResult(fakeBlob, { maxSize: '300KB', maxWidth: 1000, allowedFormats: ['png'] }, 1200, 800, 'jpg');
    assert.strictEqual(invalid.isValid, false);
    assert.strictEqual(invalid.issues.length, 3);
  });

  // 8. getConstraintPreset
  test('getConstraintPreset - returns valid presets and handles unknown', () => {
    const presets = ['web-optimized', 'thumbnail', 'email-attachment', 'mobile-upload', 'profile-picture', 'document-scan'];
    presets.forEach(p => {
      const preset = utils.getConstraintPreset(p);
      assert.ok(preset, `Preset ${p} should be defined`);
      assert.ok(preset.maxSize, `Preset ${p} should have maxSize`);
      assert.ok(Array.isArray(preset.allowedFormats), `Preset ${p} should have allowedFormats array`);
    });
    assert.strictEqual(utils.getConstraintPreset('non-existent'), null);
  });

  // 9. calculateAspectRatioDimensions
  test('calculateAspectRatioDimensions - fit and fill modes with various aspect ratios', () => {
    const fitRes = utils.calculateAspectRatioDimensions(1000, 500, 1.0, 'fit');
    assert.strictEqual(fitRes.width, 500);
    assert.strictEqual(fitRes.height, 500);

    const fitTall = utils.calculateAspectRatioDimensions(500, 1000, 1.0, 'fit');
    assert.strictEqual(fitTall.width, 500);
    assert.strictEqual(fitTall.height, 500);

    const fillRes = utils.calculateAspectRatioDimensions(1000, 500, 1.0, 'fill');
    assert.strictEqual(fillRes.width, 1000);
    assert.strictEqual(fillRes.height, 1000);
  });

  // 10. getOptimalFormat
  test('getOptimalFormat - selects best format based on preference and constraints', () => {
    assert.strictEqual(utils.getOptimalFormat({ allowedFormats: ['webp', 'jpg'] }, 'png'), 'jpg');
    assert.strictEqual(utils.getOptimalFormat({ allowedFormats: ['webp', 'pdf'] }, 'png'), 'webp');
    assert.strictEqual(utils.getOptimalFormat({ allowedFormats: ['png', 'jpg'] }, 'png'), 'png');
    assert.strictEqual(utils.getOptimalFormat({}, 'png'), 'png');
  });

  // 11. estimateFinalSize
  test('estimateFinalSize - handles normal and edge cases without NaN', () => {
    const meta = { size: 1000000, width: 2000, height: 1000 };
    const plan = {
      steps: [
        { type: 'resize', from: { width: 2000, height: 1000 }, to: { width: 1000, height: 500 } },
        { type: 'format-conversion', from: 'png', to: 'jpg' }
      ]
    };
    const est = utils.estimateFinalSize(meta, plan);
    assert.ok(!isNaN(est), 'Estimated size should not be NaN');
    assert.ok(est > 0, 'Estimated size should be > 0');

    const edgePlan = {
      steps: [
        { type: 'resize', from: { width: 0, height: 0 }, to: { width: 100, height: 100 } }
      ]
    };
    const edgeEst = utils.estimateFinalSize(meta, edgePlan);
    assert.ok(!isNaN(edgeEst), 'Edge estimated size should not be NaN');
  });

  // 12. generateTransformationReport
  test('generateTransformationReport - produces string output with accurate reduction math', () => {
    const mockResult = {
      success: true,
      originalMetadata: { name: 'test.png', size: 1000000, format: 'png', width: 2000, height: 1500 },
      newMetadata: { name: 'test.jpg', size: 200000, format: 'jpg', width: 1000, height: 750 },
      transformationsApplied: ['format-conversion: png → jpg', 'resize: 2000x1500 → 1000x750', 'compression'],
      validation: { issues: [] }
    };
    const report = utils.generateTransformationReport(mockResult);
    assert.ok(typeof report === 'string');
    assert.ok(report.includes('PASSED'));
    assert.ok(report.includes('Size Reduction: 781.25 KB (80.0%)'));
  });

  // 13. buildMinimalPDF
  test('buildMinimalPDF - generates valid PDF bytes with correct XREF offsets', () => {
    const dummyJpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0xFF, 0xD9]);
    const pdfBytes = mod.buildMinimalPDF(dummyJpeg, 800, 600);
    assert.ok(pdfBytes instanceof Uint8Array);
    assert.ok(pdfBytes.length > 500);

    const buf = Buffer.from(pdfBytes);
    assert.ok(buf.toString('utf8', 0, 8).startsWith('%PDF-1.4'));
    assert.ok(buf.includes('startxref'));
    assert.ok(buf.toString().endsWith('%%EOF\n'));

    const xrefIndex = buf.indexOf('xref\n');
    assert.ok(xrefIndex > 0);
    const startXrefPos = buf.indexOf('startxref\n') + 'startxref\n'.length;
    const recordedXrefOffset = parseInt(buf.toString('utf8', startXrefPos, buf.indexOf('\n%%EOF')));
    assert.strictEqual(recordedXrefOffset, xrefIndex, 'Recorded xref offset must exactly match byte position');
  });

  // 14. Check manifest.json and referenced files
  test('manifest.json validity and referenced files existence', () => {
    const manifestPath = path.join(__dirname, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(manifest.manifest_version, 3);
    assert.ok(manifest.action && manifest.action.default_popup, 'action.default_popup must be specified');
    const popupPath = path.join(__dirname, manifest.action.default_popup);
    assert.ok(fs.existsSync(popupPath), `Popup file ${manifest.action.default_popup} must exist!`);
  });

  // 15. Check demo.html, popup.html, and cover.html completeness
  test('demo.html, popup.html, and cover.html structure & Poppins font links', () => {
    const demoPath = path.join(__dirname, 'demo.html');
    const popupPath = path.join(__dirname, 'popup.html');
    const coverPath = path.join(__dirname, 'cover.html');

    assert.ok(fs.existsSync(demoPath), 'demo.html must exist');
    assert.ok(fs.existsSync(popupPath), 'popup.html must exist');
    assert.ok(fs.existsSync(coverPath), 'cover.html must exist');

    const demoHtml = fs.readFileSync(demoPath, 'utf8');
    const popupHtml = fs.readFileSync(popupPath, 'utf8');
    const coverHtml = fs.readFileSync(coverPath, 'utf8');

    const popupJsPath = path.join(__dirname, 'popup.js');
    assert.ok(fs.existsSync(popupJsPath), 'popup.js must exist');

    assert.ok(demoHtml.includes('Poppins'), 'demo.html must include Poppins font');
    assert.ok(popupHtml.includes('Poppins'), 'popup.html must include Poppins font');
    assert.ok(coverHtml.includes('Poppins'), 'cover.html must include Poppins font');

    assert.ok(demoHtml.includes('fileTransformModule.js'));
    assert.ok(demoHtml.includes('transformUtilities.js'));
    assert.ok(popupHtml.includes('fileTransformModule.js'));
    assert.ok(popupHtml.includes('transformUtilities.js'));
    assert.ok(popupHtml.includes('popup.js'), 'popup.html must reference external popup.js');
    assert.ok(!popupHtml.includes('<script>'), 'popup.html must not contain inline scripts for Chrome Extension MV3 CSP compliance');
  });

  // 16. calculateSavingsStats
  test('calculateSavingsStats - accurately computes latency reduction and speedup multiplier', () => {
    // 5MB raw -> 350KB transformed, 180ms processing, 10 Mbps uplink
    const stats = utils.calculateSavingsStats(5 * 1024 * 1024, 350 * 1024, 180, 10);
    assert.ok(stats.bytesSaved > 4.5 * 1024 * 1024);
    assert.ok(stats.percentReduction >= 90);
    assert.ok(stats.traditionalTotalSec >= 5.0);
    assert.ok(stats.optiUploadTotalSec <= 0.6);
    assert.ok(stats.latencySavedSec >= 4.5);
    assert.ok(stats.latencyReductionPercent >= 85);
    assert.ok(stats.speedupMultiplier >= 9.0);
  });

  // 17. History helpers
  test('history helpers - save, get, and clear', () => {
    utils.clearHistory();
    const initial = utils.getHistory();
    assert.strictEqual(initial.length, 0);

    utils.saveToHistory({
      name: 'banner.png',
      originalSize: 2000000,
      newSize: 250000,
      format: 'webp',
      savingsPercent: 87.5,
      durationSec: 0.15
    });

    const list = utils.getHistory();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].name, 'banner.png');

    utils.clearHistory();
    assert.strictEqual(utils.getHistory().length, 0);
  });

  // 18. blobToBase64 export check
  test('blobToBase64 helper is exported and defined', () => {
    assert.strictEqual(typeof mod.blobToBase64, 'function');
  });

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passCount} Passed, ${failCount} Failed`);
  console.log(`========================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests();
