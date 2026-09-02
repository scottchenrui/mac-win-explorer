#!/usr/bin/env bash
# 生成 macOS .icns 图标集（依赖 macOS 的 iconutil）。
# 沙箱里跑不了；交付时你在 Mac 上执行：bash scripts/make-icns.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/build/icon.png"
DST="$ROOT/build/icon.icns"
ICONSET="$ROOT/build/icon.iconset"

if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "本脚本只能在 macOS 上运行（需要 iconutil）。"
  echo "沙箱是 Linux，跳过；打包 .app/.dmg 前请在 Mac 上执行。"
  exit 0
fi

if [[ ! -f "$SRC" ]]; then
  echo "找不到 $SRC"
  exit 1
fi

rm -rf "$ICONSET" "$DST"
mkdir -p "$ICONSET"

# macOS 标准图标尺寸
for size in 16 32 64 128 256 512; do
  sips -z "$size" "$size" "$SRC" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) "$SRC" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET" -o "$DST"
rm -rf "$ICONSET"
echo "生成 $DST"
