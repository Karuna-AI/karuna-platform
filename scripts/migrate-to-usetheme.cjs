// Replace component-scope `const colors = getColors(true)` calls with the new
// `useTheme()` hook from ThemeContext, so components re-render when the system
// color scheme flips. Module-scope getColors() callers (onboarding/* — colors
// baked at import) need a deeper refactor and are left for a follow-up.
const fs = require('fs');

const files = [
  'src/components/ChatBubble.tsx',
  'src/components/ChatScreen.tsx',
  'src/components/IntentActionModal.tsx',
  'src/components/LoadingIndicator.tsx',
  'src/components/MemoryViewer.tsx',
  'src/components/VoiceButton.tsx',
  'src/components/WeatherWidget.tsx',
];

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;

  // 1. Replace the call. Both `const colors = getColors(true);` and the rare
  //    `getColors(false)` form get the hook.
  s = s.replace(/const\s+colors\s*=\s*getColors\([^)]*\)\s*;/g, 'const { colors } = useTheme();');

  // 2. Strip getColors from the accessibility import if it was only used for
  //    that one call (we just removed all such calls). If something else still
  //    references getColors we leave it alone.
  if (!/getColors\(/.test(s)) {
    s = s.replace(/\{([^}]*?)getColors([^}]*?)\}/g, (m, a, b) => {
      const cleaned = (a + b).replace(/,\s*,/g, ',').replace(/^\s*,/, '').replace(/,\s*$/, '');
      return '{' + cleaned + '}';
    });
    // If the resulting import is empty (`{ }`), drop the whole line.
    s = s.replace(/import\s*\{\s*\}\s*from\s*['"][^'"]*\/utils\/accessibility['"];\s*\n/g, '');
  }

  // 3. Add useTheme import if not already present. Insert near other context
  //    imports (or after the last react-native-* import).
  if (!/from\s+['"][^'"]*ThemeContext['"]/.test(s)) {
    // Try to put it after another '../context/...' import if any.
    if (/from\s+['"]\.\.\/context\/[^'"]+['"]/.test(s)) {
      s = s.replace(
        /(import[^;]+from\s+['"]\.\.\/context\/[^'"]+['"];\s*\n)/,
        (m) => m + "import { useTheme } from '../context/ThemeContext';\n"
      );
    } else {
      // Fall back: add after the last 'import' line.
      s = s.replace(/((?:^import[^;]+;\n)+)/m, (m) => m + "import { useTheme } from '../context/ThemeContext';\n");
    }
  }

  if (s !== before) {
    fs.writeFileSync(f, s);
    console.log('migrated:', f);
  } else {
    console.log('UNCHANGED:', f);
  }
}
