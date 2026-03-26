#!/usr/bin/env node
/**
 * Full Automated QA tests for Workshop-DIY presentation
 * Tests: data integrity, thumbnails, simulations, uniqueness, i18n, HTML validity, demo mode
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

let pass = 0, fail = 0, warn = 0;
const failures = [];
function ok(msg) { pass++; console.log(`  ✅ ${msg}`); }
function ko(msg) { fail++; failures.push(msg); console.log(`  ❌ ${msg}`); }
function wn(msg) { warn++; console.log(`  ⚠️  ${msg}`); }

// ═══════════════════════════════════════════════════
console.log('🔧 PARSING:');
// ═══════════════════════════════════════════════════

const appsMatch = html.match(/const APPS=\[([\s\S]*?)\];/);
if (!appsMatch) { ko('Cannot find APPS array'); process.exit(1); }

let APPS;
try {
  APPS = eval('[' + appsMatch[1] + ']');
  ok(`Parsed ${APPS.length} apps`);
} catch (e) { ko(`Failed to parse APPS: ${e.message}`); process.exit(1); }

// Extract SIMS keys
const simsMatch = html.match(/const SIMS=\{([\s\S]*?)\};\s*if\(SIMS/);
const simsBlock = simsMatch ? simsMatch[1] : '';
const simsKeys = simsBlock.match(/'([a-zA-Z][\w-]*)'\s*:\s*\(\)/g) || [];
const specificSimNames = simsKeys.map(k => k.match(/'([^']+)'/)[1]);
ok(`Found ${specificSimNames.length} app-specific simulations`);

// Extract CATS
const catMatch = html.match(/const CATS=\{([\s\S]*?)\};/);
const validCats = catMatch ? catMatch[1].match(/(\w+)\s*:/g).map(c => c.replace(/[:\s]/g, '')) : [];
ok(`Found ${validCats.length} categories`);

// ═══════════════════════════════════════════════════
console.log('\n📋 DATA INTEGRITY:');
// ═══════════════════════════════════════════════════

// Duplicate names
const names = APPS.map(a => a.name);
const dupes = names.filter((n, i) => names.indexOf(n) !== i);
if (dupes.length === 0) ok('No duplicate app names');
else ko(`Duplicate names: ${dupes.join(', ')}`);

// Required fields
let missingFields = [];
APPS.forEach(a => {
  if (!a.name) missingFields.push('unnamed app');
  if (!a.emoji) missingFields.push(`${a.name}: no emoji`);
  if (!a.desc) missingFields.push(`${a.name}: no desc`);
  if (!a.desc?.fr) missingFields.push(`${a.name}: no FR desc`);
  if (!a.desc?.en) missingFields.push(`${a.name}: no EN desc`);
  if (!a.cats || a.cats.length === 0) missingFields.push(`${a.name}: no categories`);
});
if (missingFields.length === 0) ok('All apps have required fields (name, emoji, desc FR/EN, cats)');
else ko(`Missing fields: ${missingFields.join('; ')}`);

// Emoji not empty
const noEmoji = APPS.filter(a => !a.emoji || a.emoji.trim().length === 0);
if (noEmoji.length === 0) ok('All apps have non-empty emoji');
else ko(`Missing emoji: ${noEmoji.map(a => a.name).join(', ')}`);

// Short descriptions
let truncDesc = [];
APPS.forEach(a => {
  const d = a.desc?.fr || '';
  if (d.length > 0 && d.length < 20) truncDesc.push(`${a.name} (${d.length}ch)`);
});
if (truncDesc.length === 0) ok('No suspiciously short descriptions (<20 chars)');
else wn(`Short FR descriptions: ${truncDesc.join(', ')}`);

// ═══════════════════════════════════════════════════
console.log('\n🌍 INTERNATIONALIZATION:');
// ═══════════════════════════════════════════════════

// Purpose in all 3 languages
['fr', 'en', 'ar'].forEach(lang => {
  const missing = APPS.filter(a => !a.purpose || !a.purpose[lang]);
  if (missing.length === 0) ok(`All apps have ${lang.toUpperCase()} purpose`);
  else wn(`${missing.length} apps missing ${lang.toUpperCase()} purpose: ${missing.slice(0, 5).map(a => a.name).join(', ')}${missing.length > 5 ? '...' : ''}`);
});

// Hints
const noHints = APPS.filter(a => !a.hints || a.hints.length === 0);
if (noHints.length === 0) ok('All apps have hints');
else wn(`${noHints.length} apps missing hints`);

// ═══════════════════════════════════════════════════
console.log('\n🖼️  THUMBNAILS:');
// ═══════════════════════════════════════════════════

const withThumb = APPS.filter(a => a.thumb);
const withoutThumb = APPS.filter(a => !a.thumb);
ok(`${withThumb.length} screenshots, ${withoutThumb.length} simulations`);

// Check thumb files exist on disk
const thumbDir = __dirname + '/../apps/thumbs/';
let brokenThumbs = [];
withThumb.forEach(a => {
  if (!fs.existsSync(thumbDir + a.thumb)) brokenThumbs.push(a.name);
});
if (brokenThumbs.length === 0) ok('All referenced thumbnails exist on disk');
else ko(`Broken thumb refs: ${brokenThumbs.join(', ')}`);

// Check for rawgit-interstitial screenshots (~65KB)
let suspectThumbs = [];
withThumb.forEach(a => {
  const p = thumbDir + a.thumb;
  if (fs.existsSync(p)) {
    const size = fs.statSync(p).size;
    if (size >= 63000 && size <= 68000) suspectThumbs.push(`${a.name} (${(size / 1024).toFixed(0)}KB)`);
  }
});
if (suspectThumbs.length === 0) ok('No suspect rawgit-interstitial screenshots');
else ko(`Possible rawgit screenshots: ${suspectThumbs.join(', ')}`);

// Check for very small screenshots (likely broken)
let tinyThumbs = [];
withThumb.forEach(a => {
  const p = thumbDir + a.thumb;
  if (fs.existsSync(p)) {
    const size = fs.statSync(p).size;
    if (size < 10000) tinyThumbs.push(`${a.name} (${(size / 1024).toFixed(0)}KB)`);
  }
});
if (tinyThumbs.length === 0) ok('No suspiciously small thumbnails (<10KB)');
else wn(`Tiny thumbnails: ${tinyThumbs.join(', ')}`);

// Orphan thumb files (on disk but not referenced)
if (fs.existsSync(thumbDir)) {
  const diskThumbs = fs.readdirSync(thumbDir).filter(f => f.endsWith('.png') && f !== 'all.png');
  const referencedThumbs = withThumb.map(a => a.thumb);
  const orphans = diskThumbs.filter(f => !referencedThumbs.includes(f));
  if (orphans.length === 0) ok('No orphan thumbnail files on disk');
  else wn(`${orphans.length} orphan thumbs: ${orphans.join(', ')}`);
}

// ═══════════════════════════════════════════════════
console.log('\n🎨 SIMULATIONS — UNIQUENESS:');
// ═══════════════════════════════════════════════════

// Apps without thumb should have specific sim or good category fallback
const noThumbNoSim = withoutThumb.filter(a => !specificSimNames.includes(a.name));
const simCoverage = ((withoutThumb.length - noThumbNoSim.length) / withoutThumb.length * 100).toFixed(0);
if (noThumbNoSim.length === 0) ok(`100% of no-thumb apps have specific simulations`);
else if (noThumbNoSim.length <= 10) wn(`${simCoverage}% sim coverage — ${noThumbNoSim.length} apps use generic fallback: ${noThumbNoSim.map(a => a.name).join(', ')}`);
else wn(`${simCoverage}% sim coverage — ${noThumbNoSim.length} apps use generic fallback: ${noThumbNoSim.slice(0, 10).map(a => a.name).join(', ')}...`);

// Check specific sims reference valid app names
const cleanSimNames = specificSimNames.filter(n => n.length > 0);
const invalidSimNames = cleanSimNames.filter(n => !names.includes(n));
if (invalidSimNames.length === 0) ok(`All ${cleanSimNames.length} SIMS entries reference valid app names`);
else wn(`SIMS entries for non-existent apps: ${invalidSimNames.join(', ')}`);

// Check that no two SIMS produce identical HTML (detect exact copy-paste)
const simEntries = simsBlock.split(/'[a-zA-Z][\w-]*'\s*:\s*\(\)\s*=>/);
const simBodies = simEntries.slice(1).map(s => {
  // Trim to just the template literal content, normalize whitespace
  return s.replace(/,\s*$/, '').trim().replace(/\s+/g, ' ');
});
const simDupes = [];
for (let i = 0; i < simBodies.length; i++) {
  for (let j = i + 1; j < simBodies.length; j++) {
    // Only flag if >90% similar (exact match after normalization)
    if (simBodies[i] === simBodies[j] && simBodies[i].length > 50) {
      simDupes.push(`${specificSimNames[i]} = ${specificSimNames[j]}`);
    }
  }
}
if (simDupes.length === 0) ok('No duplicate simulation HTML between apps');
else ko(`Duplicate sims: ${simDupes.join(', ')}`);

// ═══════════════════════════════════════════════════
console.log('\n🔄 DEMO MODE:');
// ═══════════════════════════════════════════════════

// Check buildSimulation exists and doesn't over-reference app name
const demoSimMatch = html.match(/function buildSimulation[\s\S]*?^}/m);
if (demoSimMatch) {
  ok('buildSimulation function exists');
  const nameRefs = (demoSimMatch[0].match(/\$\{name\}/g) || []).length;
  if (nameRefs <= 5) ok(`Demo sim references \${name} ${nameRefs} times (minimal)`);
  else wn(`Demo sim references \${name} ${nameRefs} times — check for duplication`);
} else wn('buildSimulation function not found');

// Check buildSlideHTML exists
if (html.includes('function buildSlideHTML')) ok('buildSlideHTML function exists');
else ko('buildSlideHTML function missing');

// Check purpose is not duplicated in demo simulation
const purposeInDemoSim = (html.match(/function buildSimulation[\s\S]*?function buildSlideHTML/)||[''])[0];
const purposeRefs = (purposeInDemoSim.match(/\$\{purpose\}/g) || []).length;
if (purposeRefs === 0) ok('No purpose duplication in demo simulations');
else wn(`Purpose text appears ${purposeRefs} times in demo simulation builder`);

// Check demo overlay exists
if (html.includes('demo-overlay') || html.includes('demo-slide')) ok('Demo mode UI elements exist');
else ko('Demo mode UI elements missing');

// ═══════════════════════════════════════════════════
console.log('\n📐 CATEGORIES & CONSISTENCY:');
// ═══════════════════════════════════════════════════

// Valid categories
let invalidCats = [];
APPS.forEach(a => {
  (a.cats || []).forEach(c => {
    if (!validCats.includes(c)) invalidCats.push(`${a.name}: "${c}"`);
  });
});
if (invalidCats.length === 0) ok('All app categories are valid');
else ko(`Invalid categories: ${invalidCats.join(', ')}`);

// Check no empty category arrays
const emptyCats = APPS.filter(a => !a.cats || a.cats.length === 0);
if (emptyCats.length === 0) ok('No apps with empty category arrays');
else ko(`Empty categories: ${emptyCats.map(a => a.name).join(', ')}`);

// Check app count consistency
const countEl = html.match(/getElementById\('app-count'\)\.textContent=APPS\.length/);
if (countEl) ok('App count is dynamic (not hardcoded)');
else wn('App count display not found or may be hardcoded');

// ═══════════════════════════════════════════════════
console.log('\n🌐 HTML & CSS INTEGRITY:');
// ═══════════════════════════════════════════════════

// Check essential HTML structure
const essentialIds = ['grid', 'search', 'filters', 'app-count'];
essentialIds.forEach(id => {
  if (html.includes(`id="${id}"`) || html.includes(`id='${id}'`)) ok(`Element #${id} exists`);
  else ko(`Missing element #${id}`);
});

// Check language switcher
if (html.includes('FR') && html.includes('EN')) ok('Language switcher present (FR/EN)');
else wn('Language switcher may be missing');

// Check dark mode toggle
if (html.includes('dark') && (html.includes('theme') || html.includes('toggle'))) ok('Dark mode support present');
else wn('Dark mode support may be missing');

// Check no broken template literals — unclosed ${ without matching } within 500 chars (skip inline JS)
const scriptContent = (html.match(/<script>([\s\S]*)<\/script>/) || ['', ''])[1];
const brokenTpl = scriptContent.match(/\$\{[^}`]{500,}/g);
if (!brokenTpl) ok('No broken template literals');
else ko(`Found ${brokenTpl.length} potentially broken template literals`);

// Check JS parses correctly
try {
  const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
  if (scriptMatch) {
    new Function(scriptMatch[1]);
    ok('JavaScript parses without errors');
  } else ko('No <script> block found');
} catch (e) {
  ko(`JavaScript parse error: ${e.message}`);
}

// Check CSS exists
if (html.includes('<style>')) ok('CSS styles present');
else ko('No <style> block found');

// ═══════════════════════════════════════════════════
console.log('\n🔗 LINKS & URLS:');
// ═══════════════════════════════════════════════════

// Check BASE URL defined
const baseMatch = html.match(/const BASE='([^']+)'/);
if (baseMatch) {
  ok(`BASE URL: ${baseMatch[1]}`);
  if (baseMatch[1].startsWith('https://')) ok('BASE uses HTTPS');
  else wn('BASE does not use HTTPS');
} else wn('BASE URL not found');

// Check PAGES URL defined
const pagesMatch = html.match(/const PAGES='([^']+)'/);
if (pagesMatch) ok(`PAGES URL: ${pagesMatch[1]}`);
else wn('PAGES URL not found');

// ═══════════════════════════════════════════════════
console.log('\n📊 STATISTICS:');
// ═══════════════════════════════════════════════════

// Category distribution
const catDist = {};
APPS.forEach(a => (a.cats || []).forEach(c => { catDist[c] = (catDist[c] || 0) + 1; }));
const catSummary = Object.entries(catDist).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(' ');
console.log(`  📈 Category distribution: ${catSummary}`);

// Thumb vs sim ratio
console.log(`  📈 Screenshots: ${withThumb.length}/${APPS.length} (${(withThumb.length/APPS.length*100).toFixed(0)}%)`);
console.log(`  📈 Specific sims: ${specificSimNames.length}/${withoutThumb.length} no-thumb apps (${simCoverage}%)`);
console.log(`  📈 Generic fallback: ${noThumbNoSim.length} apps`);

// ═══════════════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
if (fail === 0) {
  console.log(`🎉 ALL CLEAR: ${pass} passed, ${warn} warnings`);
} else {
  console.log(`💥 FAILED: ${pass} passed, ${fail} FAILED, ${warn} warnings`);
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ❌ ${f}`));
}
console.log('═'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
