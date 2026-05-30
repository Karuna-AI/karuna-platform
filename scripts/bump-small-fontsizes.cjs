// Bulk-bump fontSize: 10/11/12/13 -> 14 across src/. fontSize values below 14
// fail WCAG 1.4.4 (resize text) for body copy, which matters more for Karuna's
// elderly target audience than for typical apps. Existing FONT_SIZES.large
// scale starts at 14 anyway. No occurrence loses information; rows may grow
// slightly taller — that's the point.
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk('src');
let totalReplaced = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  // Match fontSize:<ws>10|11|12|13 with a word boundary so we don't catch 100/120 etc.
  s = s.replace(/fontSize:\s*1[0-3]\b/g, 'fontSize: 14');
  if (s !== before) {
    const count = (before.match(/fontSize:\s*1[0-3]\b/g) || []).length;
    totalReplaced += count;
    fs.writeFileSync(f, s);
    console.log('changed:', f, '(' + count + ' occurrences)');
  }
}
console.log('\ntotal replacements:', totalReplaced);
