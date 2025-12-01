import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('📦 Packaging extension for Chrome Web Store (whitelisted files only)...\n');

const distDir = path.join(__dirname, 'dist');
const publicDir = path.join(__dirname, 'public');
const packageDir = path.join(__dirname, 'extension-package');

// Clean previous package
if (fs.existsSync(packageDir)) {
  fs.rmSync(packageDir, { recursive: true });
}

// Create package directory
fs.mkdirSync(packageDir, { recursive: true });

// WHITELIST: Only copy files required by Chrome Web Store
const rootFiles = ['manifest.json', 'background.js', 'content.js'];

const iconFiles = ['icon16.png', 'icon48.png', 'icon128.png'];

console.log('✓ Copying required root files:');
rootFiles.forEach((file) => {
  const src = path.join(__dirname, file);
  const dest = path.join(packageDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  - ${file}`);
  } else {
    console.error(`  ✗ MISSING: ${file} (required!)`);
  }
});

console.log('\n✓ Copying icon files:');
iconFiles.forEach((file) => {
  const src = path.join(publicDir, file);
  const dest = path.join(packageDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  - ${file}`);
  } else {
    console.error(`  ✗ MISSING: ${file} (required!)`);
  }
});

// Fix manifest.json icon paths for packaged version
console.log('\n✓ Fixing manifest icon paths for package:');
const manifestPath = path.join(packageDir, 'manifest.json');
const manifestContent = fs.readFileSync(manifestPath, 'utf8');
const fixedManifest = manifestContent
  .replace('"public/icon16.png"', '"icon16.png"')
  .replace('"public/icon48.png"', '"icon48.png"')
  .replace('"public/icon128.png"', '"icon128.png"');
fs.writeFileSync(manifestPath, fixedManifest);
console.log('  - Updated icon paths in manifest.json');

// Copy ONLY popup.html and assets/ from dist folder
console.log('\n✓ Copying dist/ (popup + assets):');
if (fs.existsSync(distDir)) {
  // Copy popup.html
  const popupSrc = path.join(distDir, 'popup.html');
  const popupDest = path.join(packageDir, 'dist', 'popup.html');
  fs.mkdirSync(path.join(packageDir, 'dist'), { recursive: true });
  if (fs.existsSync(popupSrc)) {
    fs.copyFileSync(popupSrc, popupDest);
    console.log('  - dist/popup.html');
  }

  // Copy assets folder
  const assetsSrc = path.join(distDir, 'assets');
  const assetsDest = path.join(packageDir, 'dist', 'assets');
  if (fs.existsSync(assetsSrc)) {
    fs.cpSync(assetsSrc, assetsDest, { recursive: true });
    console.log('  - dist/assets/ (CSS/JS bundles)');
  }
} else {
  console.error('  ✗ MISSING: dist/ folder (run "npm run build" first!)');
}

console.log('\n✅ Extension packaged successfully!');
console.log(`📁 Package location: ${packageDir}`);
console.log('\n⚠️  VERIFICATION - Package should contain ONLY:');
console.log('   - manifest.json');
console.log('   - background.js');
console.log('   - content.js');
console.log('   - icon16.png, icon48.png, icon128.png');
console.log('   - dist/popup.html');
console.log('   - dist/assets/*.js');
console.log('   - dist/assets/*.css');
console.log('\n📋 Next steps:');
console.log('1. Verify: Get-ChildItem -Recurse extension-package');
console.log(
  '2. Create ZIP: Compress-Archive -Path extension-package\\* -DestinationPath lms-extension.zip -Force'
);
console.log('3. Upload lms-extension.zip to Chrome Web Store');
console.log('\n🚫 DO NOT include README.md, PRIVACY_POLICY.md, package.json, or any source files!');
