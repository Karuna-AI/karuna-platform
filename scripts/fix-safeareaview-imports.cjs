// One-shot codemod: replace `SafeAreaView` from 'react-native' with the version
// from 'react-native-safe-area-context'. The built-in is no-op on Android, which
// causes status-bar/gesture-pill overlap on every screen.
const fs = require('fs');

const files = [
  'src/components/AuditLogScreen.tsx',
  'src/components/ChatScreen.tsx',
  'src/components/ConsentScreen.tsx',
  'src/components/LanguageSelector.tsx',
  'src/components/LockScreen.tsx',
  'src/components/MemoryViewer.tsx',
  'src/components/SecuritySettingsScreen.tsx',
  'src/components/SettingsScreen.tsx',
  'src/components/onboarding/OnboardingFlow.tsx',
];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');

  // Find the react-native import block containing SafeAreaView.
  let blockStart = -1;
  let blockEnd = -1;
  let inBlock = false;
  let hadSAV = false;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (!inBlock && /^\s*import\s*\{/.test(L) && !/}\s*from/.test(L)) {
      inBlock = true;
      blockStart = i;
      hadSAV = false;
    }
    if (inBlock) {
      if (/\bSafeAreaView\b/.test(L)) hadSAV = true;
      if (/\}\s*from\s*['"]react-native['"];?/.test(L)) {
        blockEnd = i;
        inBlock = false;
        if (hadSAV) break;
        blockStart = -1; blockEnd = -1; hadSAV = false;
      } else if (/\}/.test(L) && blockEnd === -1) {
        // close brace of a non-RN block; reset
        inBlock = false; blockStart = -1; hadSAV = false;
      }
    }
  }

  if (blockStart < 0 || blockEnd < 0 || !hadSAV) {
    console.log('SKIP (no RN block with SafeAreaView):', f);
    continue;
  }

  // Drop the SafeAreaView line (with or without trailing comma) from the block.
  const before = lines.slice(0, blockStart);
  const block = lines.slice(blockStart, blockEnd + 1).filter(L => !/^\s*SafeAreaView\s*,?\s*$/.test(L));
  const after = lines.slice(blockEnd + 1);

  const newSrc = [
    ...before,
    ...block,
    "import { SafeAreaView } from 'react-native-safe-area-context';",
    ...after,
  ].join('\n');

  if (newSrc !== src) {
    fs.writeFileSync(f, newSrc);
    console.log('OK:', f);
  } else {
    console.log('UNCHANGED:', f);
  }
}
