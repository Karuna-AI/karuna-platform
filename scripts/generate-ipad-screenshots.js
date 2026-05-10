const sharp = require('sharp');
const path = require('path');

const WIDTH = 2048;
const HEIGHT = 2732;
const OUTPUT_DIR = path.join(__dirname, '..', 'store-assets');

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const screenshots = [
  {
    n: 1, title: 'Your AI Companion', subtitle: 'Voice-first assistant for daily support',
    cards: [
      ['Voice Conversations', 'Talk naturally in 50+ languages'],
      ['Medication Reminders', 'Never miss a dose with smart alerts'],
      ['Care Circle', 'Connect family and caregivers securely'],
      ['Personal Vault', 'Store important info safely'],
      ['Health Tracking', 'Monitor wellness and activity patterns'],
      ['Emergency SOS', 'One-tap alerts to your care circle'],
    ]
  },
  {
    n: 2, title: 'Voice-First in 50+ Languages', subtitle: 'Speak naturally, Karuna understands',
    cards: [
      ['Hindi', 'Namaste, main Karuna hoon'],
      ['Tamil', 'Full voice support'],
      ['Telugu', 'Full voice support'],
      ['Spanish', 'Full voice support'],
      ['Mandarin', 'Full voice support'],
      ['Bengali', 'Full voice support'],
      ['Arabic', 'Full voice support'],
      ['Marathi', 'Full voice support'],
    ]
  },
  {
    n: 3, title: 'Care Circle', subtitle: 'Keep your family connected and informed',
    cards: [
      ['Family Dashboard', 'See everyones status at a glance'],
      ['Smart Alerts', 'Real-time caregiver notifications'],
      ['Shared Notes', 'Coordinate care together'],
      ['Appointments', 'Track doctor visits and schedules'],
      ['Activity Feed', 'Stay updated on daily activities'],
      ['Health Insights', 'Wellness trends and reports'],
    ]
  },
  {
    n: 4, title: 'Secure Personal Vault', subtitle: 'Your information, protected with AES-256 encryption',
    cards: [
      ['Medications', 'Dosages, schedules and reminders'],
      ['Documents', 'Medical records and prescriptions'],
      ['Doctors', 'Contact info and specialties'],
      ['Contacts', 'Emergency numbers and family'],
      ['Accounts', 'Bank and insurance details'],
      ['Appointments', 'Upcoming visits and history'],
    ]
  },
  {
    n: 5, title: 'Health and Medication Tracking', subtitle: 'Monitor wellness and never miss a dose',
    cards: [
      ['Heart Rate', '72 BPM - Normal'],
      ['Blood Pressure', '120/80 mmHg - Healthy'],
      ['Daily Steps', '4,230 steps today'],
      ['Medication Adherence', '94% this week'],
      ['Sleep Quality', '7.2 hours last night'],
      ['Glucose Level', '98 mg/dL - Normal'],
    ]
  },
];

async function generate(s) {
  const headerH = 450;
  const cardH = 260;
  const cardW = 900;
  const gap = 30;
  const margin = 80;

  let svgCards = '';
  const cols = 2;
  for (let i = 0; i < s.cards.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * (cardW + gap);
    const y = headerH + 60 + row * (cardH + gap);
    const [cardTitle, cardDesc] = s.cards[i];

    svgCards += `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="24" fill="#F0EEFF" />`;
    svgCards += `<text x="${x + 40}" y="${y + 100}" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="48" fill="#1E1B4B">${esc(cardTitle)}</text>`;
    if (cardDesc) {
      svgCards += `<text x="${x + 40}" y="${y + 170}" font-family="Arial,Helvetica,sans-serif" font-size="36" fill="#6B7280">${esc(cardDesc)}</text>`;
    }
  }

  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="white"/>
    <rect width="${WIDTH}" height="${headerH}" fill="#4F46E5"/>
    <text x="${margin}" y="180" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="80" fill="white">${esc(s.title)}</text>
    <text x="${margin}" y="270" font-family="Arial,Helvetica,sans-serif" font-size="44" fill="rgba(255,255,255,0.85)">${esc(s.subtitle)}</text>
    <text x="${margin}" y="350" font-family="Arial,Helvetica,sans-serif" font-size="36" fill="rgba(255,255,255,0.6)">Karuna AI Companion</text>
    ${svgCards}
    <rect y="${HEIGHT - 80}" width="${WIDTH}" height="80" fill="#4F46E5"/>
    <text x="${WIDTH / 2}" y="${HEIGHT - 25}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="32" fill="white">Karuna AI - Your Companion for Life</text>
  </svg>`;

  const outFile = path.join(OUTPUT_DIR, `ipad-screenshot-${s.n}-2048x2732.png`);
  await sharp(Buffer.from(svg))
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toFile(outFile);

  const meta = await sharp(outFile).metadata();
  console.log(`iPad Screenshot ${s.n}: ${meta.width}x${meta.height}, channels=${meta.channels}, hasAlpha=${meta.hasAlpha}`);
}

Promise.all(screenshots.map(generate)).then(() => console.log('All iPad screenshots generated!'));
