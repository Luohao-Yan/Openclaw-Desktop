#!/bin/bash
# SKILL 快速安装脚本
# 用途：将自定义 SKILL 包安装到指定 Agent Workspace
#
# 使用方法：
#   ./install_skill.sh <agent-name> <skill-name> <source-path>
#
# 示例：
#   ./install_skill.sh fullstack-dev my-skill /tmp/my-skill-package
#   ./install_skill.sh security-engineer audit-tool ./audit-skill

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
print_header() {
    echo ""
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
    echo ""
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

print_info()ari() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 验证参数
if [ $# -lt 3 ]; then
    echo "用法: $0 <agent-name> <skill-name> <source-path>"
    echo ""
    echo "参数说明:"
    echo "  agent-name   : 目标 Agent 名称（如 fullstack-dev）"
    echo "  skill-name   : SKILL 名称（将作为目录名）"
    echo "  source-path  : SKILL 源文件所在目录"
    echo ""
    echo "示例:"
    echo "  $0 fullstack-dev my-skill /tmp/my-skill-package"
    echo "  $0 security-engineer audit-tool ./audit-skill"
    exit 1
fi

AGENT_NAME="$1"
SKILL_NAME="$2"
SOURCE_PATH="$3"

# 转换为绝对路径
SOURCE_PATH=$(cd "$SOURCE_PATH" && pwd)

# 路径配置
AGENT_WORKSPACE="$HOME/.openclaw/workspace-$AGENT_NAME"
SKILL_PATH="$AGENT_WORKSPACE/skills/$SKILL_NAME"

print_header "SKILL 安装脚本"
echo "目标 Agent: $AGENT_NAME"
echo "SKILL 名称: $SKILL_NAME"
echo "源路径: $SOURCE_PATH"
echo "目标路径: $SKILL_PATH"
echo ""

# 确认安装
echo -n "确认安装? (y/N): "
read -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "安装已取消"
    exit 0
fi

# 步骤 1: 验证源路径
print_info "步骤 1/5: 验证源路径"
if [ ! -d "$SOURCE_PATH" ]; then
    print_error "源路径不存在: $SOURCE_PATH"
    exit 1
fi

if [ ! -f "$SOURCE_PATH/SKILL.md" ]; then
    print_error "源路径中缺少 SKILL.md: $SOURCE_PATH/SKILL.md"
    exit 1
fi

print_success "源路径验证通过"
echo ""

# 步骤 2: 创建目标目录
print_info "步骤 2/5: 创建目标目录"
mkdir -p "$SKILL_PATH"
print_success "目录创建成功: $SKILL_PATH"
echo ""

# 步骤 3: 复制文件
print_info "步骤 3/5: 复制 SKILL 文件"

# 复制所有文件
if cp -r "$SOURCE_PATH"/* "$SKILL_PATH/"; then
    print_success "文件复制成功"
else
    print_error "文件复制失败"
    exit 1
fi

# 列出复制的文件
echo ""
echo "已复制的文件："
find "$SKILL_PATH" -type f | head -20
FILE_COUNT=$(find "$SKILL_PATH" -type f | wc -l)
if [ $FILE_COUNT -gt 20 ]; then
    echo "... 还有 $((FILE_COUNT - 20)) 个文件"
fi
echo ""

# 步骤 4: 设置执行权限
print_info "步骤 4/5: 设置脚本执行权限"
EXEC_COUNT=0

# 为所有可执行脚本添加权限
find "$SKILL_PATH/scripts" -type f -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true
find "$SKILL_PATH/scripts" -type f -name "*.py" -exec chmod +x {} \; 2>/dev/null || true
find "$SKILL_PATH/scripts" -type f -name "*.rb" -exec chmod +x {} \; 2>/dev/null || true

# 统计有执行权限的文件
EXEC_COUNT=$(find "$SKILL_PATH/scripts" -type f -perm +111 | wc -l 2>/dev/null || echo 0)

if [ $EXEC_COUNT -gt 0 ]; then
    print_success "已为 $EXEC_COUNT 个脚本设置执行权限"
else
    print_info "未发现需要设置权限的脚本（或权限已存在）"
fi
echo ""

# 步骤 5: 验证安装
print_info "步骤 5/5: 验证安装"
echo ""

# 检查必需文件
if [ ! -f "$SKILL_PATH/SKILL.md" ]; then
    print_error "安装验证失败：SKILL.md 不存在"
    exit 1
fi

# 检查 SKILL.md 内容
if ! grep -q "## 描述" "$SKILL_PATH/SKILL.md"; then
    print_warning "SKILL.md 中未找到 '描述' 字段，这可能影响 SKILL 加载"
fi

print_success "安装验证通过"
echo ""

# 安装成功
print_header "安装完成"
print_success "SKILL 安装成功！"
echo ""
echo "安装详情："
echo "  Agent: $AGENT_NAME"
echo "  SKILL: $SKILL_NAME"
echo "  路径: $SKILL_PATH"
echo ""
echo "下一步操作："
echo "1. 运行验证脚本："
echo "   ./verify_skill_install.sh $AGENT_NAME $SKILL_NAME"
echo ""
echo "2. 重启 OpenClaw Gateway（如果需要）："
echo "   openclaw gateway restart"
echo ""
echo "3. 在 openclaw-desktop 前端测试 SKILL 功能"
echo ""

# 询问是否立即运行验证
echo -n "是否立即运行验证脚本? (Y/n): "
read -r RUN_VERIFY
if [[ "$RUN_VERIFY" =~ ^[Yy]$ ]] || [[ -z "$RUN_VERIFY" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "$SCRIPT_DIR/verify_skill_install.sh" ]; then
        bash "$SCRIPT_DIR/verify_skill_install.sh" "$AGENT_NAME" "$SKILL_NAME"
    else
        print_warning "验证脚本未找到，请手动运行："
        echo "  ./verify_skill_install.sh $AGENT_NAME $SKILL_NAME"
    fi
fi

exit 0
