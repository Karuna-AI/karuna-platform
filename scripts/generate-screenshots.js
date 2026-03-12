#!/usr/bin/env node
/**
 * Generate App Store screenshots for Karuna AI Companion
 * Resolution: 1284x2778 (iPhone 6.5" display)
 *
 * Usage: node scripts/generate-screenshots.js
 */

const fs = require('fs');
const path = require('path');

// Try to require sharp, install if missing
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('sharp not found, installing...');
  const { execSync } = require('child_process');
  execSync('npm install sharp --no-save', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  sharp = require('sharp');
}

const WIDTH = 1284;
const HEIGHT = 2778;
const BRAND = '#4F46E5';
const BRAND_DARK = '#3730A3';
const BRAND_LIGHT = '#818CF8';
const WHITE = '#FFFFFF';
const LIGHT_BG = '#F3F4F6';
const CARD_BG = '#FFFFFF';
const TEXT_DARK = '#1F2937';
const TEXT_MED = '#6B7280';
const TEXT_LIGHT = '#9CA3AF';
const GREEN = '#10B981';
const RED = '#EF4444';
const ORANGE = '#F59E0B';
const BLUE = '#3B82F6';
const PINK = '#EC4899';

const OUTPUT_DIR = path.join(__dirname, '..', 'store-assets');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Helper: escape XML special characters for SVG text
function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Generate status bar SVG
function statusBar() {
  return `
    <!-- Status Bar -->
    <rect x="0" y="0" width="${WIDTH}" height="120" fill="${BRAND}"/>
    <text x="80" y="80" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="${WHITE}" font-weight="bold">9:41</text>
    <!-- Signal bars -->
    <rect x="960" y="55" width="12" height="30" rx="2" fill="${WHITE}"/>
    <rect x="978" y="48" width="12" height="37" rx="2" fill="${WHITE}"/>
    <rect x="996" y="40" width="12" height="45" rx="2" fill="${WHITE}"/>
    <rect x="1014" y="32" width="12" height="53" rx="2" fill="${WHITE}"/>
    <!-- WiFi -->
    <circle cx="1060" cy="60" r="4" fill="${WHITE}"/>
    <path d="M1045,48 Q1060,35 1075,48" stroke="${WHITE}" stroke-width="3" fill="none"/>
    <path d="M1050,55 Q1060,45 1070,55" stroke="${WHITE}" stroke-width="3" fill="none"/>
    <!-- Battery -->
    <rect x="1100" y="45" width="55" height="28" rx="5" stroke="${WHITE}" stroke-width="2.5" fill="none"/>
    <rect x="1155" y="53" width="5" height="12" rx="2" fill="${WHITE}"/>
    <rect x="1104" y="49" width="42" height="20" rx="3" fill="${GREEN}"/>
  `;
}

// Headline section
function headline(text, subtitle) {
  let svg = `
    <rect x="0" y="120" width="${WIDTH}" height="400" fill="${BRAND}"/>
    <text x="${WIDTH / 2}" y="280" font-family="Arial, Helvetica, sans-serif" font-size="72" fill="${WHITE}" font-weight="bold" text-anchor="middle">${esc(text)}</text>
  `;
  if (subtitle) {
    svg += `<text x="${WIDTH / 2}" y="360" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="${BRAND_LIGHT}" text-anchor="middle">${esc(subtitle)}</text>`;
  }
  return svg;
}

// Bottom brand bar
function bottomBar() {
  return `
    <rect x="0" y="${HEIGHT - 160}" width="${WIDTH}" height="160" fill="${BRAND}"/>
    <text x="${WIDTH / 2}" y="${HEIGHT - 80}" font-family="Arial, Helvetica, sans-serif" font-size="42" fill="${WHITE}" font-weight="bold" text-anchor="middle" letter-spacing="3">KARUNA</text>
    <text x="${WIDTH / 2}" y="${HEIGHT - 35}" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="${BRAND_LIGHT}" text-anchor="middle">AI Companion for Elders</text>
  `;
}

// Home indicator
function homeIndicator() {
  return `<rect x="${WIDTH / 2 - 70}" y="${HEIGHT - 178}" width="140" height="6" rx="3" fill="${WHITE}" opacity="0.5"/>`;
}

// Wrap SVG
function wrapSvg(content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <!-- Background -->
    <defs>
      <clipPath id="screen">
        <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="60"/>
      </clipPath>
    </defs>
    <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="60" fill="${LIGHT_BG}"/>
    <g clip-path="url(#screen)">
    ${content}
    </g>
    <!-- Device frame border -->
    <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="60" fill="none" stroke="#D1D5DB" stroke-width="4"/>
  </svg>`;
}

// =========================================================
// Screenshot 1: Chat Interface
// =========================================================
function screenshot1() {
  const chatY = 520;
  return wrapSvg(`
    ${statusBar()}
    ${headline('Your AI Companion', 'Always by your side')}

    <!-- Chat area background -->
    <rect x="0" y="${chatY}" width="${WIDTH}" height="${HEIGHT - chatY - 160}" fill="${WHITE}"/>

    <!-- User message -->
    <rect x="350" y="${chatY + 80}" width="850" height="120" rx="30" fill="${BRAND}"/>
    <text x="450" y="${chatY + 150}" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="${WHITE}">Good morning Karuna</text>
    <!-- User avatar -->
    <circle cx="1260" cy="${chatY + 140}" r="40" fill="${BRAND_LIGHT}"/>
    <text x="1260" y="${chatY + 155}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="${WHITE}" text-anchor="middle" font-weight="bold">Y</text>

    <!-- AI message -->
    <circle cx="80" cy="${chatY + 360}" r="40" fill="${BRAND}"/>
    <text x="80" y="${chatY + 375}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="${WHITE}" text-anchor="middle" font-weight="bold">K</text>
    <rect x="140" y="${chatY + 280}" width="950" height="200" rx="30" fill="#EEF2FF"/>
    <text x="190" y="${chatY + 345}" font-family="Arial, Helvetica, sans-serif" font-size="36" fill="${TEXT_DARK}">Good morning! &#x1F60A;</text>
    <text x="190" y="${chatY + 400}" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="${TEXT_DARK}">You have 2 medications due and</text>
    <text x="190" y="${chatY + 445}" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="${TEXT_DARK}">a doctor appointment at 3 PM today.</text>

    <!-- Medication reminder card -->
    <rect x="140" y="${chatY + 540}" width="950" height="280" rx="24" fill="${WHITE}" stroke="#E5E7EB" stroke-width="2"/>
    <rect x="140" y="${chatY + 540}" width="950" height="70" rx="24" fill="#EEF2FF"/>
    <rect x="140" y="${chatY + 585}" width="950" height="25" fill="#EEF2FF"/>
    <text x="190" y="${chatY + 590}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="${BRAND}" font-weight="bold">&#x1F48A; Medications Due</text>
    <rect x="190" y="${chatY + 640}" width="850" height="70" rx="12" fill="${LIGHT_BG}"/>
    <circle cx="240" cy="${chatY + 675}" r="18" fill="${GREEN}"/>
    <text x="280" y="${chatY + 685}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="${TEXT_DARK}">Metformin 500mg  -  8:00 AM</text>
    <rect x="190" y="${chatY + 730}" width="850" height="70" rx="12" fill="${LIGHT_BG}"/>
    <circle cx="240" cy="${chatY + 765}" r="18" fill="${ORANGE}"/>
    <text x="280" y="${chatY + 775}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="${TEXT_DARK}">Lisinopril 10mg  -  9:00 AM</text>

    <!-- Appointment card -->
    <rect x="140" y="${chatY + 880}" width="950" height="180" rx="24" fill="${WHITE}" stroke="#E5E7EB" stroke-width="2"/>
    <rect x="140" y="${chatY + 880}" width="950" height="70" rx="24" fill="#FEF3C7"/>
    <rect x="140" y="${chatY + 925}" width="950" height="25" fill="#FEF3C7"/>
    <text x="190" y="${chatY + 930}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#92400E" font-weight="bold">&#x1F4C5; Today's Appointment</text>
    <text x="190" y="${chatY + 1000}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="${TEXT_DARK}">Dr. Sharma - General Checkup</text>
    <text x="190" y="${chatY + 1040}" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="${TEXT_MED}">3:00 PM  |  City Medical Center</text>

    <!-- Input bar -->
    <rect x="0" y="${chatY + 1120}" width="${WIDTH}" height="120" fill="${WHITE}"/>
    <rect x="60" y="${chatY + 1140}" width="900" height="70" rx="35" fill="${LIGHT_BG}"/>
    <text x="110" y="${chatY + 1185}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="${TEXT_LIGHT}">Type or tap mic to speak...</text>
    <!-- Mic button -->
    <circle cx="1080" cy="${chatY + 1175}" r="38" fill="${BRAND}"/>
    <rect x="1072" y="${chatY + 1150}" width="16" height="30" rx="8" fill="${WHITE}"/>
    <path d="M1064,${chatY + 1175} Q1064,${chatY + 1195} 1080,${chatY + 1195} Q1096,${chatY + 1195} 1096,${chatY + 1175}" stroke="${WHITE}" stroke-width="3" fill="none"/>
    <line x1="1080" y1="${chatY + 1195}" x2="1080" y2="${chatY + 1205}" stroke="${WHITE}" stroke-width="3"/>
    <!-- Send button -->
    <circle cx="1180" cy="${chatY + 1175}" r="38" fill="${GREEN}"/>
    <polygon points="1165,${chatY + 1175} 1195,${chatY + 1175} 1180,${chatY + 1155}" fill="${WHITE}"/>

    ${bottomBar()}
    ${homeIndicator()}
  `);
}

// =========================================================
// Screenshot 2: Voice & Languages
// =========================================================
function screenshot2() {
  const contentY = 520;
  const centerX = WIDTH / 2;
  const centerY = contentY + 550;

  // Language items positioned around the mic
  const languages = [
    { name: 'Hindi', code: 'हिंदी', x: centerX - 400, y: centerY - 350, color: '#F97316' },
    { name: 'Tamil', code: 'தமிழ்', x: centerX + 350, y: centerY - 350, color: '#10B981' },
    { name: 'Spanish', code: 'Español', x: centerX - 450, y: centerY - 50, color: '#EF4444' },
    { name: 'Telugu', code: 'తెలుగు', x: centerX + 400, y: centerY - 50, color: '#8B5CF6' },
    { name: 'Bengali', code: 'বাংলা', x: centerX - 400, y: centerY + 250, color: '#EC4899' },
    { name: 'Mandarin', code: '中文', x: centerX + 350, y: centerY + 250, color: '#F59E0B' },
    { name: 'Arabic', code: 'العربية', x: centerX - 250, y: centerY + 500, color: '#14B8A6' },
    { name: 'Japanese', code: '日本語', x: centerX + 200, y: centerY + 500, color: '#6366F1' },
  ];

  let langSvg = '';
  languages.forEach(l => {
    langSvg += `
      <rect x="${l.x - 120}" y="${l.y - 45}" width="240" height="90" rx="16" fill="${CARD_BG}" stroke="${l.color}" stroke-width="3"/>
      <text x="${l.x}" y="${l.y - 8}" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="${l.color}" text-anchor="middle" font-weight="bold">${esc(l.name)}</text>
      <text x="${l.x}" y="${l.y + 28}" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="${TEXT_MED}" text-anchor="middle">${esc(l.code)}</text>
    `;
    // Dashed line to center
    langSvg += `<line x1="${l.x}" y1="${l.y}" x2="${centerX}" y2="${centerY}" stroke="${l.color}" stroke-width="1.5" stroke-dasharray="8,8" opacity="0.35"/>`;
  });

  return wrapSvg(`
    ${statusBar()}
    ${headline('Voice-First in 50+ Languages', 'Speak naturally in your language')}

    <rect x="0" y="${contentY}" width="${WIDTH}" height="${HEIGHT - contentY - 160}" fill="${WHITE}"/>

    ${langSvg}

    <!-- Central microphone -->
    <circle cx="${centerX}" cy="${centerY}" r="140" fill="${BRAND}"/>
    <circle cx="${centerX}" cy="${centerY}" r="160" fill="none" stroke="${BRAND_LIGHT}" stroke-width="3" stroke-dasharray="12,6"/>
    <circle cx="${centerX}" cy="${centerY}" r="185" fill="none" stroke="${BRAND_LIGHT}" stroke-width="2" stroke-dasharray="8,10" opacity="0.5"/>
    <!-- Mic icon -->
    <rect x="${centerX - 30}" y="${centerY - 65}" width="60" height="85" rx="30" fill="${WHITE}"/>
    <path d="M${centerX - 55},${centerY + 10} Q${centerX - 55},${centerY + 60} ${centerX},${centerY + 60} Q${centerX + 55},${centerY + 60} ${centerX + 55},${centerY + 10}" stroke="${WHITE}" stroke-width="6" fill="none"/>
    <line x1="${centerX}" y1="${centerY + 60}" x2="${centerX}" y2="${centerY + 85}" stroke="${WHITE}" stroke-width="6"/>
    <line x1="${centerX - 25}" y1="${centerY + 85}" x2="${centerX + 25}" y2="${centerY + 85}" stroke="${WHITE}" stroke-width="6"/>

    <!-- Pulse rings -->
    <circle cx="${centerX}" cy="${centerY}" r="200" fill="none" stroke="${BRAND_LIGHT}" stroke-width="2" opacity="0.3"/>
    <circle cx="${centerX}" cy="${centerY}" r="230" fill="none" stroke="${BRAND_LIGHT}" stroke-width="1.5" opacity="0.2"/>

    <!-- 50+ badge -->
    <rect x="${centerX - 80}" y="${centerY + 210}" width="160" height="60" rx="30" fill="${GREEN}"/>
    <text x="${centerX}" y="${centerY + 250}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="${WHITE}" text-anchor="middle" font-weight="bold">50+ Languages</text>

    ${bottomBar()}
    ${homeIndicator()}
  `);
}

// =========================================================
// Screenshot 3: Care Circle
// =========================================================
function screenshot3() {
  const contentY = 520;
  const centerX = WIDTH / 2;
  const centerY = contentY + 500;

  const members = [
    { label: 'You', x: centerX, y: centerY, r: 90, color: BRAND, textColor: WHITE },
    { label: 'Daughter', x: centerX - 320, y: centerY - 280, r: 75, color: PINK, textColor: WHITE },
    { label: 'Son', x: centerX + 320, y: centerY - 280, r: 75, color: BLUE, textColor: WHITE },
    { label: 'Nurse', x: centerX - 380, y: centerY + 200, r: 70, color: GREEN, textColor: WHITE },
    { label: 'Doctor', x: centerX + 380, y: centerY + 200, r: 70, color: RED, textColor: WHITE },
  ];

  let connections = '';
  for (let i = 1; i < members.length; i++) {
    connections += `<line x1="${members[0].x}" y1="${members[0].y}" x2="${members[i].x}" y2="${members[i].y}" stroke="${members[i].color}" stroke-width="4" opacity="0.4"/>`;
  }
  // Connect siblings
  connections += `<line x1="${members[1].x}" y1="${members[1].y}" x2="${members[2].x}" y2="${members[2].y}" stroke="#D1D5DB" stroke-width="2" stroke-dasharray="8,6"/>`;

  let circles = '';
  members.forEach(m => {
    circles += `
      <circle cx="${m.x}" cy="${m.y}" r="${m.r + 8}" fill="none" stroke="${m.color}" stroke-width="3" opacity="0.3"/>
      <circle cx="${m.x}" cy="${m.y}" r="${m.r}" fill="${m.color}"/>
      <text x="${m.x}" y="${m.y + 12}" font-family="Arial, Helvetica, sans-serif" font-size="${m.r > 80 ? 36 : 30}" fill="${m.textColor}" text-anchor="middle" font-weight="bold">${esc(m.label)}</text>
    `;
  });

  // Feature cards at bottom
  const cardY = centerY + 450;
  const features = [
    { icon: '🔔', text: 'Real-time Alerts', color: ORANGE },
    { icon: '📍', text: 'Location Sharing', color: BLUE },
    { icon: '💬', text: 'Group Messages', color: GREEN },
  ];

  let featureCards = '';
  features.forEach((f, i) => {
    const cx = 130 + i * 360;
    featureCards += `
      <rect x="${cx}" y="${cardY}" width="320" height="120" rx="20" fill="${WHITE}" stroke="#E5E7EB" stroke-width="2"/>
      <text x="${cx + 50}" y="${cardY + 55}" font-family="Arial, Helvetica, sans-serif" font-size="38">${f.icon}</text>
      <text x="${cx + 95}" y="${cardY + 58}" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="${TEXT_DARK}" font-weight="bold">${esc(f.text)}</text>
      <text x="${cx + 95}" y="${cardY + 95}" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${TEXT_MED}">Stay connected</text>
    `;
  });

  return wrapSvg(`
    ${statusBar()}
    ${headline('Care Circle', 'Your family, connected & informed')}

    <rect x="0" y="${contentY}" width="${WIDTH}" height="${HEIGHT - contentY - 160}" fill="${WHITE}"/>

    <!-- Connection lines -->
    ${connections}

    <!-- Member circles -->
    ${circles}

    <!-- Feature cards -->
    ${featureCards}

    ${bottomBar()}
    ${homeIndicator()}
  `);
}

// =========================================================
// Screenshot 4: Secure Personal Vault
// =========================================================
function screenshot4() {
  const contentY = 520;

  const categories = [
    { icon: '💊', name: 'Medications', desc: '12 items stored', color: '#EF4444' },
    { icon: '📄', name: 'Documents', desc: '8 items stored', color: '#3B82F6' },
    { icon: '🏥', name: 'Doctors', desc: '5 contacts saved', color: '#10B981' },
    { icon: '📞', name: 'Emergency Contacts', desc: '4 contacts saved', color: '#F59E0B' },
    { icon: '🔑', name: 'Accounts & Passwords', desc: 'Encrypted & secure', color: '#8B5CF6' },
    { icon: '📋', name: 'Insurance', desc: '3 policies stored', color: '#EC4899' },
  ];

  let cards = '';
  categories.forEach((c, i) => {
    const y = contentY + 100 + i * 175;
    cards += `
      <rect x="80" y="${y}" width="1124" height="150" rx="24" fill="${CARD_BG}" stroke="#E5E7EB" stroke-width="2"/>
      <!-- Color accent bar -->
      <rect x="80" y="${y}" width="10" height="150" rx="5" fill="${c.color}"/>
      <!-- Icon circle -->
      <circle cx="175" cy="${y + 75}" r="42" fill="${c.color}15"/>
      <text x="175" y="${y + 90}" font-family="Arial, Helvetica, sans-serif" font-size="42" text-anchor="middle">${c.icon}</text>
      <!-- Text -->
      <text x="250" y="${y + 62}" font-family="Arial, Helvetica, sans-serif" font-size="36" fill="${TEXT_DARK}" font-weight="bold">${esc(c.name)}</text>
      <text x="250" y="${y + 105}" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="${TEXT_MED}">${esc(c.desc)}</text>
      <!-- Chevron -->
      <path d="M1140,${y + 60} L1160,${y + 75} L1140,${y + 90}" stroke="${TEXT_LIGHT}" stroke-width="3" fill="none"/>
    `;
  });

  // Lock icon at center top
  const lockY = contentY + 1220;

  return wrapSvg(`
    ${statusBar()}
    ${headline('Secure Personal Vault', 'Your data, protected & private')}

    <rect x="0" y="${contentY}" width="${WIDTH}" height="${HEIGHT - contentY - 160}" fill="${LIGHT_BG}"/>

    ${cards}

    <!-- Security badge -->
    <rect x="${WIDTH / 2 - 280}" y="${lockY}" width="560" height="200" rx="24" fill="${BRAND}" opacity="0.95"/>
    <!-- Lock icon -->
    <rect x="${WIDTH / 2 - 25}" y="${lockY + 35}" width="50" height="40" rx="8" fill="${WHITE}"/>
    <path d="M${WIDTH / 2 - 20},${lockY + 35} L${WIDTH / 2 - 20},${lockY + 20} Q${WIDTH / 2 - 20},${lockY + 0} ${WIDTH / 2},${lockY + 0} Q${WIDTH / 2 + 20},${lockY + 0} ${WIDTH / 2 + 20},${lockY + 20} L${WIDTH / 2 + 20},${lockY + 35}" stroke="${WHITE}" stroke-width="5" fill="none"/>
    <circle cx="${WIDTH / 2}" cy="${lockY + 55}" r="6" fill="${BRAND}"/>
    <text x="${WIDTH / 2}" y="${lockY + 120}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="${WHITE}" text-anchor="middle" font-weight="bold">256-bit Encryption</text>
    <text x="${WIDTH / 2}" y="${lockY + 165}" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="${BRAND_LIGHT}" text-anchor="middle">Biometric &amp; PIN Protected</text>

    ${bottomBar()}
    ${homeIndicator()}
  `);
}

// =========================================================
// Screenshot 5: Health & Medication Tracking
// =========================================================
function screenshot5() {
  const contentY = 520;

  // Health metric cards - 2x2 grid
  const metrics = [
    { icon: '❤️', name: 'Heart Rate', value: '72', unit: 'BPM', trend: '▲ Normal', color: RED, bgColor: '#FEF2F2' },
    { icon: '🩺', name: 'Blood Pressure', value: '120/80', unit: 'mmHg', trend: '▲ Good', color: BLUE, bgColor: '#EFF6FF' },
    { icon: '🚶', name: 'Steps Today', value: '4,250', unit: 'steps', trend: '65% of goal', color: GREEN, bgColor: '#F0FDF4' },
    { icon: '💊', name: 'Med Adherence', value: '94', unit: '%', trend: 'This week', color: '#8B5CF6', bgColor: '#F5F3FF' },
  ];

  let metricCards = '';
  metrics.forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 80 + col * 580;
    const y = contentY + 80 + row * 380;

    metricCards += `
      <rect x="${x}" y="${y}" width="544" height="350" rx="28" fill="${CARD_BG}" stroke="#E5E7EB" stroke-width="2"/>
      <!-- Header -->
      <rect x="${x}" y="${y}" width="544" height="90" rx="28" fill="${m.bgColor}"/>
      <rect x="${x}" y="${y + 60}" width="544" height="30" fill="${m.bgColor}"/>
      <text x="${x + 70}" y="${y + 58}" font-family="Arial, Helvetica, sans-serif" font-size="38">${m.icon}</text>
      <text x="${x + 120}" y="${y + 60}" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="${m.color}" font-weight="bold">${esc(m.name)}</text>
      <!-- Value -->
      <text x="${x + 60}" y="${y + 210}" font-family="Arial, Helvetica, sans-serif" font-size="80" fill="${TEXT_DARK}" font-weight="bold">${esc(m.value)}</text>
      <text x="${x + (m.value.length > 3 ? 60 + m.value.length * 45 : 60 + m.value.length * 50)}" y="${y + 210}" font-family="Arial, Helvetica, sans-serif" font-size="36" fill="${TEXT_MED}"> ${esc(m.unit)}</text>
      <!-- Trend -->
      <rect x="${x + 50}" y="${y + 260}" width="220" height="50" rx="25" fill="${m.bgColor}"/>
      <text x="${x + 160}" y="${y + 293}" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="${m.color}" text-anchor="middle" font-weight="bold">${esc(m.trend)}</text>
    `;
  });

  // Medication schedule timeline
  const timelineY = contentY + 860;
  const meds = [
    { time: '8:00 AM', name: 'Metformin 500mg', status: 'taken', color: GREEN },
    { time: '9:00 AM', name: 'Lisinopril 10mg', status: 'taken', color: GREEN },
    { time: '2:00 PM', name: 'Vitamin D3', status: 'upcoming', color: ORANGE },
    { time: '8:00 PM', name: 'Metformin 500mg', status: 'upcoming', color: TEXT_LIGHT },
    { time: '9:00 PM', name: 'Amlodipine 5mg', status: 'upcoming', color: TEXT_LIGHT },
  ];

  let timeline = `
    <rect x="80" y="${timelineY}" width="1124" height="730" rx="28" fill="${CARD_BG}" stroke="#E5E7EB" stroke-width="2"/>
    <text x="140" y="${timelineY + 60}" font-family="Arial, Helvetica, sans-serif" font-size="36" fill="${TEXT_DARK}" font-weight="bold">Today's Schedule</text>
    <!-- Timeline line -->
    <line x1="230" y1="${timelineY + 100}" x2="230" y2="${timelineY + 680}" stroke="#E5E7EB" stroke-width="3"/>
  `;

  meds.forEach((m, i) => {
    const my = timelineY + 140 + i * 120;
    const checkmark = m.status === 'taken' ? `
      <circle cx="230" cy="${my + 20}" r="18" fill="${GREEN}"/>
      <path d="M220,${my + 20} L228,${my + 28} L242,${my + 12}" stroke="${WHITE}" stroke-width="3" fill="none"/>
    ` : `
      <circle cx="230" cy="${my + 20}" r="18" fill="${WHITE}" stroke="${m.color}" stroke-width="3"/>
    `;
    timeline += `
      ${checkmark}
      <text x="270" y="${my + 15}" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="${TEXT_MED}">${esc(m.time)}</text>
      <text x="270" y="${my + 50}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="${TEXT_DARK}" font-weight="${m.status === 'taken' ? 'normal' : 'bold'}">${esc(m.name)}</text>
      <text x="900" y="${my + 35}" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="${m.color}" font-weight="bold">${m.status === 'taken' ? 'Taken ✓' : m.status === 'upcoming' ? 'Upcoming' : ''}</text>
    `;
  });

  return wrapSvg(`
    ${statusBar()}
    ${headline('Health & Medication Tracking', 'Stay on top of your health')}

    <rect x="0" y="${contentY}" width="${WIDTH}" height="${HEIGHT - contentY - 160}" fill="${LIGHT_BG}"/>

    ${metricCards}

    ${timeline}

    ${bottomBar()}
    ${homeIndicator()}
  `);
}

// =========================================================
// Main
// =========================================================
async function main() {
  ensureDir(OUTPUT_DIR);

  const screenshots = [
    { name: 'ios-screenshot-1-1284x2778.png', generator: screenshot1 },
    { name: 'ios-screenshot-2-1284x2778.png', generator: screenshot2 },
    { name: 'ios-screenshot-3-1284x2778.png', generator: screenshot3 },
    { name: 'ios-screenshot-4-1284x2778.png', generator: screenshot4 },
    { name: 'ios-screenshot-5-1284x2778.png', generator: screenshot5 },
  ];

  for (const ss of screenshots) {
    const svg = ss.generator();
    const outputPath = path.join(OUTPUT_DIR, ss.name);

    try {
      await sharp(Buffer.from(svg))
        .resize(WIDTH, HEIGHT)
        .png()
        .toFile(outputPath);

      console.log(`Created: ${outputPath}`);
    } catch (err) {
      console.error(`Error creating ${ss.name}:`, err.message);
    }
  }

  console.log('\nDone! All screenshots saved to:', OUTPUT_DIR);
}

main().catch(console.error);
