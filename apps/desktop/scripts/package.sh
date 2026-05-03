#!/usr/bin/env bash
set -e

# ─── 用法 ──────────────────────────────────────────────
# ./scripts/package.sh           # 默认构建 macOS
# ./scripts/package.sh mac       # 构建 macOS
# ./scripts/package.sh win       # 构建 Windows（需 macOS 上交叉编译可用的工具）
# ./scripts/package.sh all       # 构建 macOS + Windows
# ───────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

PLATFORM="${1:-mac}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ViviPet 打包工具"
echo " 平台: $PLATFORM"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 0. 清理旧的构建产物
echo ""
echo "▶ 清理 dist/ release/"
# rm -rf 在 macOS 上遇到特殊文件可能失败，使用强力删除
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

# 1. 编译
echo ""
echo "▶ 编译主进程 + 渲染器..."
npm run build

# 2. 打包
echo ""
echo "▶ 打包应用..."
case "$PLATFORM" in
  mac)
    npx electron-builder --mac --publish never
    ;;
  win)
    npx electron-builder --win --publish never
    ;;
  all)
    npx electron-builder --mac --win --publish never
    ;;
  *)
    echo "未知平台: $PLATFORM (可用: mac, win, all)"
    exit 1
    ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✅ 构建完成"
ls -lh release/*.dmg release/*.zip 2>/dev/null || ls -lh release/ 2>/dev/null
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
