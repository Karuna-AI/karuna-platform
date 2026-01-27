#!/usr/bin/env node
/**
 * Generate Placeholder Assets for Karuna App
 *
 * This script generates placeholder image assets for development.
 * For production, replace these with properly designed assets.
 *
 * Usage:
 *   npm install sharp --save-dev
 *   node scripts/generate-assets.js
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is installed
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('Installing sharp for image generation...');
  const { execSync } = require('child_process');
  execSync('npm install sharp --save-dev', { stdio: 'inherit' });
  sharp = require('sharp');
}

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const BRAND_COLOR = '#4F46E5'; // Karuna brand purple
const WHITE = '#FFFFFF';

// Asset specifications
const assets = [
  {
    name: 'icon.png',
    width: 1024,
    height: 1024,
    background: BRAND_COLOR,
    text: 'K',
    textColor: WHITE,
  },
  {
    name: 'splash.png',
    width: 1284,
    height: 2778,
    background: BRAND_COLOR,
    text: 'Karuna',
    textColor: WHITE,
  },
  {
    name: 'adaptive-icon.png',
    width: 1024,
    height: 1024,
    background: 'transparent',
    text: 'K',
    textColor: BRAND_COLOR,
  },
  {
    name: 'favicon.png',
    width: 48,
    height: 48,
    background: BRAND_COLOR,
    text: 'K',
    textColor: WHITE,
  },
  {
    name: 'notification-icon.png',
    width: 96,
    height: 96,
    background: 'transparent',
    text: 'K',
    textColor: WHITE,
  },
];

async function generateAsset(spec) {
  const { name, width, height, background, text, textColor } = spec;
  const filePath = path.join(ASSETS_DIR, name);

  // Calculate text size (roughly 40% of smallest dimension)
  const fontSize = Math.floor(Math.min(width, height) * 0.4);

  // Create SVG with centered text
  const isTransparent = background === 'transparent';
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${!isTransparent ? `<rect width="100%" height="100%" fill="${background}"/>` : ''}
      <text
        x="50%"
        y="50%"
        font-family="Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="${textColor}"
        text-anchor="middle"
        dominant-baseline="central"
      >${text}</text>
    </svg>
  `;

  try {
    await sharp(Buffer.from(svg))
      .png()
      .toFile(filePath);
    console.log(`  Created: ${name} (${width}x${height})`);
  } catch (error) {
    console.error(`  Error creating ${name}:`, error.message);
  }
}

async function main() {
  console.log('Generating placeholder assets for Karuna app...\n');

  // Ensure assets directory exists
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  // Generate each asset
  for (const spec of assets) {
    await generateAsset(spec);
  }

  // Create a placeholder notification sound (silent WAV)
  const soundPath = path.join(ASSETS_DIR, 'notification-sound.wav');
  if (!fs.existsSync(soundPath)) {
    // Create a minimal valid WAV file (44 bytes header + 0 data = silence)
    const wavHeader = Buffer.alloc(44);
    // RIFF header
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(36, 4); // File size - 8
    wavHeader.write('WAVE', 8);
    // fmt chunk
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16); // fmt chunk size
    wavHeader.writeUInt16LE(1, 20); // Audio format (PCM)
    wavHeader.writeUInt16LE(1, 22); // Num channels
    wavHeader.writeUInt32LE(44100, 24); // Sample rate
    wavHeader.writeUInt32LE(44100 * 2, 28); // Byte rate
    wavHeader.writeUInt16LE(2, 32); // Block align
    wavHeader.writeUInt16LE(16, 34); // Bits per sample
    // data chunk
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(0, 40); // Data size

    fs.writeFileSync(soundPath, wavHeader);
    console.log('  Created: notification-sound.wav (silent placeholder)');
  }

  console.log('\nPlaceholder assets generated successfully!');
  console.log('\nNote: Replace these with properly designed assets before production.');
  console.log('See assets/ASSETS_README.md for design guidelines.');
}

main().catch(console.error);
