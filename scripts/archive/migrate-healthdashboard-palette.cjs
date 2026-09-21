// Migrate HealthDashboard.tsx's 38 raw Tailwind hex literals to the
// accessibility.ts design tokens. Adds the getColors() import (with `const c =
// getColors()` at module scope as an interim step; task #29 will convert to a
// useTheme() hook). #000 shadows and #eff6ff accent background are left as-is
// (no current token).
const fs = require('fs');
const path = 'src/components/HealthDashboard.tsx';

const map = [
  ["'#3b82f6'", 'c.primary'],
  ["'#1e40af'", 'c.primaryDark'],
  ["'#1f2937'", 'c.text'],
  ["'#6b7280'", 'c.textSecondary'],
  ["'#9ca3af'", 'c.textSecondary'],
  ["'#22c55e'", 'c.success'],
  ["'#f59e0b'", 'c.warning'],
  ["'#ffffff'", 'c.background'],
  ["'#f5f5f5'", 'c.surface'],
  ["'#e5e7eb'", 'c.border'],
  ["'#e5e5e5'", 'c.border'],
];

let s = fs.readFileSync(path, 'utf8');

// Inject the getColors import + module-level const c IF not already present.
if (!/from '\.\.\/utils\/accessibility'/.test(s)) {
  // Insert after the last existing import block at top.
  s = s.replace(
    /(import\s+\{[^}]*\}\s+from\s+'[^']+';\s*\n)+/,
    (m) => m + "import { getColors } from '../utils/accessibility';\n"
  );
}
if (!/const c = getColors\(\)/.test(s)) {
  // Insert right after the last import line.
  s = s.replace(
    /((?:import\s+[^;]+;\s*\n)+)/,
    (m) => m + '\nconst c = getColors();\n'
  );
}

let total = 0;
for (const [needle, replacement] of map) {
  const before = s;
  // Escape regex metachars in needle (the # is safe in regex char class but not as literal — fine in a char class-free position)
  const escaped = needle.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const re = new RegExp(escaped, 'g');
  s = s.replace(re, replacement);
  const count = (before.match(re) || []).length;
  if (count > 0) {
    total += count;
    console.log(needle, '->', replacement, '(' + count + ')');
  }
}

fs.writeFileSync(path, s);
console.log('\ntotal replacements:', total);
