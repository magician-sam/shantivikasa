#!/usr/bin/env python3
"""Build the pinned, offline Windows x64 distribution. No signing key required."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
ELECTRON = '44.2.0'
ARCHIVE = f'electron-v{ELECTRON}-win32-x64.zip'
RELEASE = f'https://github.com/electron/electron/releases/download/v{ELECTRON}'


def download(url, destination):
    temporary = destination.with_suffix(destination.suffix + '.download')
    request = urllib.request.Request(url, headers={'User-Agent': 'ShantiVikasaBuild/1.0'})
    with urllib.request.urlopen(request, timeout=120) as response, temporary.open('wb') as output:
        shutil.copyfileobj(response, output)
    temporary.replace(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'release')
    parser.add_argument('--runtime', type=Path, help='Existing official Electron Windows x64 ZIP')
    parser.add_argument('--checksums', type=Path, help='Official SHASUMS256.txt for the pinned release')
    parser.add_argument('--makensis', help='Path to NSIS 3 makensis, otherwise discovered on PATH')
    parser.add_argument('--seed-snapshot', type=Path, help='Private original snapshot for the installer only; never commit live receipts')
    parser.add_argument('--skip-build', action='store_true', help='Use an existing dist from npm run build')
    parser.add_argument('--stage-only', action='store_true', help='Build and verify the app files without compressing the installer')
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if not args.skip_build:
        npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
        if not npm:
            raise SystemExit('Install Node.js 24, run npm ci, then run this script again.')
        subprocess.run([npm, 'run', 'build:desktop'], cwd=ROOT, check=True)
    if not (ROOT / 'dist-desktop/index.html').is_file():
        raise SystemExit('Built interface missing. Run npm ci and npm run build first.')
    runtime = args.runtime.resolve() if args.runtime else output / ARCHIVE
    if not runtime.exists():
        print('Downloading official Electron runtime...', flush=True)
        download(f'{RELEASE}/{ARCHIVE}', runtime)
    checksums = args.checksums.resolve() if args.checksums else output / 'SHASUMS256.txt'
    if not checksums.exists():
        download(f'{RELEASE}/SHASUMS256.txt', checksums)
    expected = next((line.split()[0] for line in checksums.read_text().splitlines()
                     if line.split()[-1].lstrip('*') == ARCHIVE), None)
    with runtime.open('rb') as file:
        actual = hashlib.file_digest(file, 'sha256').hexdigest()
    if expected != actual:
        raise SystemExit('Electron checksum mismatch. The build has stopped.')
    print('Official Electron SHA-256 verified.', flush=True)
    stage = output / 'windows-app'
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir()
    with zipfile.ZipFile(runtime) as archive:
        for entry in archive.infolist():
            if not (stage / entry.filename).resolve().is_relative_to(stage):
                raise SystemExit('Invalid runtime archive path.')
        archive.extractall(stage)
    (stage / 'electron.exe').rename(stage / 'ShantiVikasa.exe')
    (stage / 'resources/default_app.asar').unlink(missing_ok=True)
    app = stage / 'resources/app'
    app.mkdir(parents=True)
    for folder in ['desktop', 'data', 'shared']:
        shutil.copytree(ROOT / folder, app / folder)
    shutil.copytree(ROOT / 'dist-desktop', app / 'dist')
    if args.seed_snapshot:
        shutil.copy2(args.seed_snapshot, app / 'data/initial-snapshot.json')
    (app / 'public').mkdir()
    shutil.copy2(ROOT / 'public/shanti-logo.png', app / 'public/shanti-logo.png')
    shutil.copy2(ROOT / 'public/shanti.ico', stage / 'shanti.ico')
    package = json.loads((ROOT / 'package.json').read_text())
    (app / 'package.json').write_text(json.dumps({key: package[key] for key in
        ['name', 'version', 'description', 'main']}, indent=2), encoding='utf-8')
    if args.stage_only:
        print(f'App files staged and runtime verified: {stage}', flush=True)
        return
    compiler = args.makensis or shutil.which('makensis')
    if not compiler and os.name == 'nt':
        candidate = Path(os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')) / 'NSIS/makensis.exe'
        if candidate.exists():
            compiler = str(candidate)
    if not compiler:
        raise SystemExit(f'Windows app staged at {stage}. Install NSIS 3 or supply --makensis to create the installer.')
    installer = output / f'ShantiVikasa-Setup-{package["version"]}.exe'
    prefix = '/' if os.name == 'nt' else '-'
    subprocess.run([compiler, f'{prefix}V3', f'{prefix}WX',
        f'{prefix}DAPP_DIR={stage}', f'{prefix}DAPP_FILES={stage / "*.*"}', f'{prefix}DOUTPUT_FILE={installer}',
        f'{prefix}DAPP_ICON={ROOT / "public/shanti.ico"}', str(ROOT / 'scripts/installer.nsi')],
        cwd=ROOT, check=True)
    print(f'Installer created: {installer}', flush=True)


if __name__ == '__main__':
    main()
