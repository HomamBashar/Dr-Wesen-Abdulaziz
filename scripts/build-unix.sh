#!/usr/bin/env bash
# =========================================
#  Al-Siraj Clinic - Linux/Mac Build Script
# =========================================
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo ""
echo "=========================================================="
echo "  Building Dr. Wesen Abdulaziz Eye Clinic Desktop App"
echo "=========================================================="

# ---- Step 1: Build React frontend ----
echo ""
echo "[1/4] Building React frontend..."
cd "$PROJECT_ROOT/frontend"
if [ ! -d node_modules ]; then
    echo "  Installing frontend dependencies..."
    yarn install
fi

# Empty backend URL => relative /api URLs (same origin)
REACT_APP_BACKEND_URL="" yarn build
echo "  Frontend built successfully."

# ---- Step 2: Install Python deps ----
echo ""
echo "[2/4] Installing Python dependencies..."
cd "$PROJECT_ROOT/backend"
pip install -r requirements.txt
pip install pyinstaller

# ---- Step 3: Clean previous builds ----
echo ""
echo "[3/4] Cleaning previous builds..."
rm -rf build dist

# ---- Step 4: Compile ----
echo ""
echo "[4/4] Compiling to executable..."
pyinstaller app.spec --clean --noconfirm

# Copy .env template
cp .env.example dist/DrWesenClinic/.env 2>/dev/null || true

echo ""
echo "=========================================================="
echo "  BUILD SUCCESSFUL!"
echo "=========================================================="
echo ""
echo "  Output: $PROJECT_ROOT/backend/dist/DrWesenClinic/"
echo "  Run:    ./DrWesenClinic"
echo ""
echo "  IMPORTANT: Edit .env inside DrWesenClinic folder to"
echo "             change CLINIC_PIN before distributing!"
echo ""
