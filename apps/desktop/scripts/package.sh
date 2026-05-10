#!/usr/bin/env bash
set -e

# ─── 用法 ──────────────────────────────────────────────
# ./scripts/package.sh           # 默认构建当前平台 (Tauri)
# ./scripts/package.sh mac       # 构建 macOS
# ./scripts/package.sh win       # 构建 Windows
# ./scripts/package.sh all       # 构建当前平台
# ───────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

PLATFORM="${1:-mac}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ViviPet 打包工具 (Tauri 2)"
echo " 平台: $PLATFORM"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 0. 清理旧的构建产物
echo ""
echo "▶ 清理 dist/ release/"
if [ -d "dist" ]; then
  find dist -type d -exec chmod 755 {} \; 2>/dev/null || true
  rm -rf dist 2>/dev/null || true
fi
if [ -d "release" ]; then
  find release -type d -exec chmod 755 {} \; 2>/dev/null || true
  rm -rf release 2>/dev/null || true
fi
# 等待文件系统释放
sleep 1

# 1. 编译并打包 (Tauri build handles both compile + bundle)
echo ""
echo "▶ Building Tauri bundle..."
case "$PLATFORM" in
  mac)
    npm run build
    ;;
  win)
    npm run build
    ;;
  all)
    npm run build
    ;;
  *)
    echo "未知平台: $PLATFORM (可用: mac, win, all)"
    exit 1
    ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✅ 构建完成"
echo " Tauri bundle artifacts in src-tauri/target/release/bundle/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
