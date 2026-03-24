#!/bin/bash
# =============================================================================
# macOS 图标生成自动化脚本
# =============================================================================
# 功能：从 SVG 源文件生成 macOS 所需的全部图标资源
# 流程：SVG → 1024x1024 PNG → 各尺寸 PNG → .iconset 目录 → .icns 文件
#
# 使用方法：
#   ./scripts/generate-mac-icons.sh
#
# 依赖：
#   - sips（macOS 内置，用于 PNG 缩放）
#   - iconutil（macOS 内置，用于生成 .icns）
#   - qlmanage 或 rsvg-convert（用于 SVG 转 PNG）
# =============================================================================

set -e

# ---- 颜色定义 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---- 打印辅助函数 ----
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_header() {
    echo ""
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
    echo ""
}

# ---- 路径配置 ----
# 获取项目根目录（脚本所在目录的上一级）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SVG_SOURCE="$PROJECT_ROOT/resources/app-icon.svg"
RESOURCES_DIR="$PROJECT_ROOT/resources"
ICNS_DIR="$RESOURCES_DIR/icns"
TMP_DIR="$PROJECT_ROOT/.tmp-icongen"
ICONSET_DIR="$TMP_DIR/icon.iconset"
BASE_PNG="$TMP_DIR/icon_1024.png"

# macOS iconset 所需的尺寸列表
SIZES=(16 32 64 128 256 512)

# ---- 依赖检查 ----
check_dependencies() {
    print_header "步骤 1/6：检查依赖工具"

    local missing=0

    # 检查 sips（macOS 内置图像处理工具）
    if command -v sips &>/dev/null; then
        print_success "sips 已安装"
    else
        print_error "sips 未找到（macOS 内置工具，请确认运行环境为 macOS）"
        missing=1
    fi

    # 检查 iconutil（macOS 内置 icns 生成工具）
    if command -v iconutil &>/dev/null; then
        print_success "iconutil 已安装"
    else
        print_error "iconutil 未找到（macOS 内置工具，请确认运行环境为 macOS）"
        missing=1
    fi

    # 检查 SVG 转 PNG 工具（优先 rsvg-convert，其次 qlmanage）
    if command -v rsvg-convert &>/dev/null; then
        SVG_CONVERTER="rsvg-convert"
        print_success "rsvg-convert 已安装（将用于 SVG → PNG 转换）"
    elif command -v qlmanage &>/dev/null; then
        SVG_CONVERTER="qlmanage"
        print_success "qlmanage 已安装（将用于 SVG → PNG 转换）"
    else
        print_error "未找到 SVG 转 PNG 工具（需要 rsvg-convert 或 qlmanage）"
        print_info "安装 rsvg-convert: brew install librsvg"
        missing=1
    fi

    if [ $missing -ne 0 ]; then
        print_error "缺少必要依赖，无法继续"
        exit 1
    fi

    # 检查 SVG 源文件是否存在
    if [ ! -f "$SVG_SOURCE" ]; then
        print_error "SVG 源文件不存在: $SVG_SOURCE"
        exit 1
    fi

    print_success "所有依赖检查通过"
}

# ---- SVG 转 1024x1024 PNG ----
convert_svg_to_png() {
    print_header "步骤 2/6：SVG → 1024x1024 PNG"

    # 创建临时目录
    rm -rf "$TMP_DIR"
    mkdir -p "$TMP_DIR"

    if [ "$SVG_CONVERTER" = "rsvg-convert" ]; then
        # 使用 rsvg-convert（更精确）
        rsvg-convert -w 1024 -h 1024 "$SVG_SOURCE" -o "$BASE_PNG"
    elif [ "$SVG_CONVERTER" = "qlmanage" ]; then
        # 使用 qlmanage（macOS 内置）
        qlmanage -t -s 1024 -o "$TMP_DIR" "$SVG_SOURCE" &>/dev/null
        # qlmanage 输出文件名带后缀，需要重命名
        local generated_file="$TMP_DIR/$(basename "$SVG_SOURCE").png"
        if [ -f "$generated_file" ]; then
            mv "$generated_file" "$BASE_PNG"
        else
            print_error "qlmanage 未能生成 PNG 文件"
            exit 1
        fi
    fi

    if [ ! -f "$BASE_PNG" ]; then
        print_error "1024x1024 PNG 生成失败"
        exit 1
    fi

    print_success "已生成 1024x1024 基础 PNG: $BASE_PNG"
}

# ---- 生成各尺寸 PNG ----
generate_sized_pngs() {
    print_header "步骤 3/6：生成各尺寸 PNG"

    mkdir -p "$ICONSET_DIR"

    # 复制 1024x1024 作为 icon_512x512@2x.png
    cp "$BASE_PNG" "$ICONSET_DIR/icon_512x512@2x.png"
    print_success "icon_512x512@2x.png (1024x1024)"

    for size in "${SIZES[@]}"; do
        local double_size=$((size * 2))
        local filename="icon_${size}x${size}.png"
        local filename_2x="icon_${size}x${size}@2x.png"

        # 生成标准尺寸（NxN）
        sips -z "$size" "$size" "$BASE_PNG" --out "$ICONSET_DIR/$filename" &>/dev/null
        print_success "$filename (${size}x${size})"

        # 生成 Retina 尺寸（2Nx2N），但跳过 512@2x（已处理为 1024）
        if [ "$size" -ne 512 ]; then
            sips -z "$double_size" "$double_size" "$BASE_PNG" --out "$ICONSET_DIR/$filename_2x" &>/dev/null
            print_success "$filename_2x (${double_size}x${double_size})"
        fi
    done

    print_success "所有 iconset PNG 文件已生成"
}

# ---- 生成 .icns 文件 ----
generate_icns() {
    print_header "步骤 4/6：生成 .icns 文件"

    mkdir -p "$ICNS_DIR"

    # 使用 iconutil 从 .iconset 目录生成 .icns
    local icns_output="$TMP_DIR/icon.icns"
    iconutil --convert icns --output "$icns_output" "$ICONSET_DIR"

    if [ ! -f "$icns_output" ]; then
        print_error ".icns 文件生成失败"
        exit 1
    fi

    # 复制到 resources/icns/ 目录，生成多个命名版本
    cp "$icns_output" "$ICNS_DIR/icon_1024.icns"
    print_success "已生成 resources/icns/icon_1024.icns"

    cp "$icns_output" "$ICNS_DIR/icon_512.icns"
    print_success "已生成 resources/icns/icon_512.icns"

    cp "$icns_output" "$ICNS_DIR/icon_128.icns"
    print_success "已生成 resources/icns/icon_128.icns"
}

# ---- 更新 resources/ 下的 PNG 文件 ----
update_resource_pngs() {
    print_header "步骤 5/6：更新 resources/ 下的 PNG 文件"

    # icon.png — 1024x1024
    cp "$BASE_PNG" "$RESOURCES_DIR/icon.png"
    print_success "已更新 resources/icon.png (1024x1024)"

    # icon_512.png — 512x512
    sips -z 512 512 "$BASE_PNG" --out "$RESOURCES_DIR/icon_512.png" &>/dev/null
    print_success "已更新 resources/icon_512.png (512x512)"

    # icon_256.png — 256x256
    sips -z 256 256 "$BASE_PNG" --out "$RESOURCES_DIR/icon_256.png" &>/dev/null
    print_success "已更新 resources/icon_256.png (256x256)"

    # icon_128.png — 128x128
    sips -z 128 128 "$BASE_PNG" --out "$RESOURCES_DIR/icon_128.png" &>/dev/null
    print_success "已更新 resources/icon_128.png (128x128)"

    # icon_32.png — 32x32
    sips -z 32 32 "$BASE_PNG" --out "$RESOURCES_DIR/icon_32.png" &>/dev/null
    print_success "已更新 resources/icon_32.png (32x32)"
}

# ---- 清理临时文件 ----
cleanup() {
    print_header "步骤 6/6：清理临时文件"

    rm -rf "$TMP_DIR"
    print_success "临时文件已清理"
}

# ---- 主流程 ----
main() {
    print_header "macOS 图标生成脚本"
    echo "源文件: $SVG_SOURCE"
    echo "输出目录: $ICNS_DIR"
    echo ""

    check_dependencies
    convert_svg_to_png
    generate_sized_pngs
    generate_icns
    update_resource_pngs
    cleanup

    print_header "图标生成完成"
    echo "生成的文件："
    echo "  .icns 文件："
    echo "    - resources/icns/icon_1024.icns"
    echo "    - resources/icns/icon_512.icns"
    echo "    - resources/icns/icon_128.icns"
    echo "  PNG 文件："
    echo "    - resources/icon.png (1024x1024)"
    echo "    - resources/icon_512.png (512x512)"
    echo "    - resources/icon_256.png (256x256)"
    echo "    - resources/icon_128.png (128x128)"
    echo "    - resources/icon_32.png (32x32)"
    echo ""
    print_success "所有图标资源已更新！"
}

# 执行主流程
main
