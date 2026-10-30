import fs from 'node:fs';
import path from 'node:path';

// Strict 4-color palette definition
const ALLOWED_HEX = new Set(['#2391FF', '#FFF83F', '#FFCD54', '#F70063'].map((h) => h.toLowerCase()));
const ALLOWED_0X = new Set(['0x2391ff', '0xfff83f', '0xffcd54', '0xf70063'].map((h) => h.toLowerCase()));
const ALLOWED_RGB_STRINGS = new Set([
  'rgb(35, 145, 255)',
  'rgb(35,145,255)',
  'rgb(35 145 255)',
  'rgb(255, 248, 63)',
  'rgb(255,248,63)',
  'rgb(255 248 63)',
  'rgb(255, 205, 84)',
  'rgb(255,205,84)',
  'rgb(255 205 84)',
  'rgb(247, 0, 99)',
  'rgb(247,0,99)',
  'rgb(247 0 99)',
]);

// Named colors strictly forbidden in CSS properties or Tailwind classes
const FORBIDDEN_NAMED_COLORS = [
  'black', 'white', 'gray', 'grey', 'slate', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'green', 'emerald', 'teal', 'cyan', 'sky', 'indigo',
  'violet', 'purple', 'fuchsia', 'rose', 'transparent', 'currentcolor'
];

// Matches class attributes: class="..." or className="..."
const CLASS_ATTR_REGEX = /\bclass(?:Name)?\s*=\s*(?:["'`]([^"'`]+)["'`]|{\s*["'`]([^"'`]+)["'`]\s*})/g;

// Forbidden Tailwind patterns inside class tokens
const FORBIDDEN_CLASS_TOKEN_REGEX = new RegExp(
  `^(?:(?:bg|text|border|ring|stroke|fill|divide|outline)-(?:${FORBIDDEN_NAMED_COLORS.join('|')})(?:-\\w+)?|(?:from|to|via)-.+|bg-gradient-.+|opacity-\\d+|.*\\/(?:\\d+|[0-9]+%))$`,
  'i'
);

// Match CSS hex colors (3, 4, 6, 8 digits)
const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

// Match Three.js numeric literals (e.g. 0x2391ff or other 0x123456)
const NUMERIC_COLOR_REGEX = /\b0x[0-9a-fA-F]{6}\b/g;

// Match rgb/rgba/hsl/hsla/hwb/lab/oklch/color-mix functions
const COLOR_FN_REGEX = /\b(rgba?|hsla?|hwb|lab|oklch|color-mix)\s*\([^)]*\)/gi;

// Match CSS properties that accept color values
const CSS_COLOR_PROPERTY_REGEX = /(?:color|background|background-color|border-color|outline-color|ring-color|fill|stroke)\s*:\s*([^;}\n]+)/gi;

function getSourceFiles(dir, baseList = []) {
  if (!fs.existsSync(dir)) return baseList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '.git'].includes(entry.name)) continue;
      getSourceFiles(fullPath, baseList);
    } else {
      if (/\.(tsx?|jsx?|css)$/i.test(entry.name)) {
        baseList.push(fullPath);
      }
    }
  }
  return baseList;
}

function getSvgFiles(dir, baseList = []) {
  if (!fs.existsSync(dir)) return baseList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getSvgFiles(fullPath, baseList);
    } else if (/\.svg$/i.test(entry.name)) {
      baseList.push(fullPath);
    }
  }
  return baseList;
}

function runCheck() {
  const rootDir = process.cwd();
  // Target: src/, public/*.svg, and config files
  const files = [
    ...getSourceFiles(path.join(rootDir, 'src')),
    ...getSvgFiles(path.join(rootDir, 'public')),
  ];

  const rootConfigs = [
    'next.config.ts',
    'next.config.mjs',
    'next.config.js',
    'tailwind.config.ts',
    'tailwind.config.js',
    'postcss.config.mjs',
    'postcss.config.js',
    'eslint.config.mjs',
  ];

  for (const cfg of rootConfigs) {
    const full = path.join(rootDir, cfg);
    if (fs.existsSync(full)) {
      files.push(full);
    }
  }

  const errors = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      if (file.includes('check-palette')) return;
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

      // 1. Check Hex colors
      let hexMatch;
      const hexRegexCopy = new RegExp(HEX_COLOR_REGEX);
      while ((hexMatch = hexRegexCopy.exec(line)) !== null) {
        const hex = hexMatch[0].toLowerCase();
        if (!ALLOWED_HEX.has(hex)) {
          errors.push({
            file,
            lineNum,
            reason: `Disallowed hex color "${hexMatch[0]}". Only ${Array.from(ALLOWED_HEX).join(', ')} are permitted.`,
            lineSnippet: trimmed,
          });
        }
      }

      // 2. Check Numeric literals (0x...)
      let numMatch;
      const numRegexCopy = new RegExp(NUMERIC_COLOR_REGEX);
      while ((numMatch = numRegexCopy.exec(line)) !== null) {
        const num = numMatch[0].toLowerCase();
        if (!ALLOWED_0X.has(num)) {
          errors.push({
            file,
            lineNum,
            reason: `Disallowed numeric color "${numMatch[0]}". Only ${Array.from(ALLOWED_0X).join(', ')} are permitted.`,
            lineSnippet: trimmed,
          });
        }
      }

      // 3. Check color functions (rgb, rgba, hsl, oklch, etc.)
      let fnMatch;
      const fnRegexCopy = new RegExp(COLOR_FN_REGEX);
      while ((fnMatch = fnRegexCopy.exec(line)) !== null) {
        const fullFn = fnMatch[0].toLowerCase();
        const fnName = fnMatch[1].toLowerCase();
        if (fnName.startsWith('rgba') || fnName.startsWith('hsl') || fnName === 'hwb' || fnName === 'lab' || fnName === 'oklch' || fnName === 'color-mix') {
          errors.push({
            file,
            lineNum,
            reason: `Forbidden color function "${fnMatch[0]}". No opacity, hsl, lab, or color-mix functions allowed.`,
            lineSnippet: trimmed,
          });
        } else if (fnName === 'rgb') {
          const normalized = fullFn.replace(/\s+/g, ' ').trim();
          if (!ALLOWED_RGB_STRINGS.has(normalized)) {
            errors.push({
              file,
              lineNum,
              reason: `Disallowed rgb value "${fnMatch[0]}". Only the exact 4 palette rgb values are permitted.`,
              lineSnippet: trimmed,
            });
          }
        }
      }

      // 4. Check forbidden Tailwind classes strictly inside class/className attributes
      let classAttrMatch;
      const classAttrRegexCopy = new RegExp(CLASS_ATTR_REGEX);
      while ((classAttrMatch = classAttrRegexCopy.exec(line)) !== null) {
        const classStr = classAttrMatch[1] || classAttrMatch[2] || '';
        const tokens = classStr.split(/\s+/).filter(Boolean);
        for (const token of tokens) {
          if (FORBIDDEN_CLASS_TOKEN_REGEX.test(token)) {
            errors.push({
              file,
              lineNum,
              reason: `Forbidden Tailwind class or opacity syntax: "${token}". Only the 4 palette tokens without opacity/gradients are permitted.`,
              lineSnippet: trimmed,
            });
          }
        }
      }

      // 5. Check CSS property declarations for forbidden named colors
      let cssMatch;
      const cssRegexCopy = new RegExp(CSS_COLOR_PROPERTY_REGEX);
      while ((cssMatch = cssRegexCopy.exec(line)) !== null) {
        const value = cssMatch[1].toLowerCase();
        for (const named of FORBIDDEN_NAMED_COLORS) {
          const namedRegex = new RegExp(`\\b${named}\\b`, 'i');
          if (namedRegex.test(value)) {
            errors.push({
              file,
              lineNum,
              reason: `Forbidden named color "${named}" in CSS property value "${cssMatch[0].trim()}".`,
              lineSnippet: trimmed,
            });
          }
        }
      }
    });
  }

  if (errors.length > 0) {
    console.error('\n❌ STRICT 4-COLOR PALETTE VIOLATION DETECTED:');
    console.error(`Found ${errors.length} violations across files:\n`);
    for (const err of errors) {
      console.error(`  - ${path.relative(rootDir, err.file)}:${err.lineNum}`);
      console.error(`    ${err.reason}`);
      console.error(`    Code: ${err.lineSnippet}\n`);
    }
    process.exit(1);
  } else {
    console.log(`\n✅ Palette Check Passed! All scanned files strictly adhere to the 4-color palette.`);
  }
}

runCheck();
