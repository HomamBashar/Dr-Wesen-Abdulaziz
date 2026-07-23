# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Dr. Wesen Abdulaziz Eye Clinic desktop app.
Build with:
    pyinstaller app.spec --clean --noconfirm
Result:
    dist/DrWesenClinic/  (folder-mode - recommended)
    dist/DrWesenClinic.exe  (if onefile=True below)
"""
import os
from pathlib import Path

block_cipher = None
project_root = Path(SPECPATH).resolve()          # /path/to/backend
repo_root = project_root.parent                  # /path/to/project
frontend_build = repo_root / 'frontend' / 'build'

# Bundle the built React app under a folder called 'frontend_build'
# so server.py can locate it via BUNDLE_DIR / 'frontend_build'.
datas = []
if frontend_build.exists():
    datas.append((str(frontend_build), 'frontend_build'))
else:
    print("[!] WARNING: frontend/build not found. Run 'yarn build' first!")

# Include a default .env template (users can override next to .exe)
env_template = project_root / '.env.example'
if env_template.exists():
    datas.append((str(env_template), '.'))

hiddenimports = [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'aiosqlite',
    'slowapi',
    'email_validator',
]

a = Analysis(
    ['launcher.py'],
    pathex=[str(project_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter', 'matplotlib', 'PIL', 'numpy', 'pandas',
        'jupyter', 'IPython', 'pytest', 'black', 'isort', 'mypy',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='DrWesenClinic',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,          # Show console for logs (change to False for silent)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,             # Optional: 'icon.ico'
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='DrWesenClinic',
)
