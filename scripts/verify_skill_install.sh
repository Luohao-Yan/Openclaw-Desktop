#!/bin/bash
# SKILL 安装验证脚本
# 用途：自动验证自定义 SKILL 包是否正确安装到指定 Agent
#
# 使用方法：
#   ./verify_skill_install.sh <agent-name> <skill-name>
#
# 示例：
#   ./verify_skill_install.sh fullstack-dev my-custom-skill

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e-e "${BLUE}================================${NC}"
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

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 验证参数
if [ $# -lt 2 ]; then
    echo "用法: $0 <agent-name> <skill-name>"
    echo ""
    echo "示例:"
    echo "  $0 fullstack-dev my-custom-skill"
    echo "  $0 security-engineer audit-tool"
    exit 1
fi

AGENT_NAME="$1"
SKILL_NAME="$2"
AGENT_WORKSPACE="$HOME/.openclaw/workspace-$AGENT_NAME"
SKILL_PATH="$AGENT_WORKSPACE/skills/$SKILL_NAME"

print_header "SKILL 安装验证工具"
echo "Agent: $AGENT_NAME"
echo "SKILL: $SKILL_NAME"
echo "Workspace: $AGENT_WORKSPACE"
echo "SKILL Path: $SKILL_PATH"
echo ""

# 检查计数
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# 检查 1: Agent Workspace 存在
print_info "检查 1/7: Agent Workspace 是否存在"
if [ ! -d "$AGENT_WORKSPACE" ]; then
    print_error "Agent Workspace 不存在: $AGENT_WORKSPACE"
    print_info "请确认 Agent 名称是否正确，或先创建该 Agent"
    exit 1
else
    print_success "Agent Workspace 存在"
    ((PASS_COUNT++))
fi
echo ""

# 检查 2: SKILL 目录存在
print_info "检查 2/7: SKILL 目录是否存在"
if [ ! -d "$SKILL_PATH" ]; then
    print_error "SKILL 目录不存在: $SKILL_PATH"
    print_info "请先运行安装脚本安装 SKILL"
    exit 1
else
    print_success "SKILL 目录存在"
    ((PASS_COUNT++))
fi
echo ""

# 检查 3: SKILL.md 存在
print_info "检查 3/7: SKILL.md 是否存在"
if [ ! -f "$SKILL_PATH/SKILL.md" ]; then
    print_error "SKILL.md 不存在"
    print_info "SKILL.md 是必需的核心文件"
    ((FAIL_COUNT++))
else
    print_success "SKILL.md 存在"
    ((PASS_COUNT++))

    # 显示 SKILL.md 前 10 行
    echo ""
    echo "SKILL.md 内容预览："
    echo "---"
    head -10 "$SKILL_PATH/SKILL.md"
    echo "---"
fi
echo ""

# 检查 4: SKILL.md 包含必需字段
print_info "检查 4/7: SKILL.md 包含必需字段"
MISSING_FIELDS=()

if ! grep -q "## 描述" "$SKILL_PATH/SKILL.md" 2>/dev/null; then
    MISSING_FIELDS+=("描述")
fi

if [ ${#MISSING_FIELDS[@]} -eq 0 ]; then
    print_success "SKILL.md 包含必需字段"
    ((PASS_COUNT++))
else
    print_error "SKILL.md 缺少必需字段: ${MISSING_FIELDS[*]}"
    ((FAIL_COUNT++))
fi
echo ""

# 检查 5: 脚本目录和权限
print_info "检查 5/7: 脚本目录和执行权限"
if [ ! -d "$SKILL_PATH/scripts" ]; then
    print_warning "无 scripts 目录（可选）"
    ((WARN_COUNT++))
else
    SCRIPT_COUNT=$(find "$SKILL_PATH/scripts" -type f | wc -l)
    EXEC_COUNT=$(find "$SKILL_PATH/scripts" -type f -perm +111 | wc -l 2>/dev/null || echo 0)

    if [ $SCRIPT_COUNT -eq 0 ]; then
        print_warning "scripts 目录为空"
        ((WARN_COUNT++))
    else
        print_success "发现 $SCRIPT_COUNT 个脚本文件"

        if [ $EXEC_COUNT -lt $SCRIPT_COUNT ]; then
            print_warning "只有 $EXEC_COUNT/$SCRIPT_COUNT 个脚本有执行权限"
            print_info "运行以下命令添加权限:"
            echo "  chmod +x $SKILL_PATH/scripts/*"
            ((WARN_COUNT++))
        else
            print_success "所有脚本都有执行权限"
            ((PASS_COUNT++))
        fi
    fi
fi
echo ""

# 检查 6: 引用文档（可选）
print_info "检查 6/7: 引用文档目录"
if [ ! -d "$SKILL_PATH/references" ]; then
    print_info "无 references 目录（可选）"
else
    REF_COUNT=$(find "$SKILL_PATH/references" -type f | wc -l)
    if [ $REF_COUNT -eq 0 ]; then
        print_warning "references 目录为空"
        ((WARN_COUNT++))
    else
        print_success "发现 $REF_COUNT 个引用文档"
        ((PASS_COUNT++))

        # 列出文档
        echo "引用文档列表："
        find "$SKILL_PATH/references" -type f | head -5
        if [ $REF_COUNT -gt 5 ]; then
            echo "... 还有 $((REF_COUNT - 5)) 个文件"
        fi
    fi
fi
echo ""

# 检查 7: OpenClaw Gateway 运行状态
print_info "检查 7/7: OpenClaw Gateway 运行状态"
if command -v openclaw &> /dev/null; then
    if openclaw gateway status &> /dev/null; then
        print_success "OpenClaw Gateway 正在运行"
        ((PASS_COUNT++))
    else
        print_warning "OpenClaw Gateway 未运行"
        print_info "启动 Gateway: openclaw gateway start"
        ((WARN_COUNT++))
    fi
else
    print_warning "未检测到 openclaw 命令"
    ((WARN_COUNT++))
fi
echo ""

# 总结
print_header "验证结果汇总"
echo -e "${GREEN}通过: $PASS_COUNT${NC}"
echo -e "${YELLOW}警告: $WARN_COUNT${NC}"
echo -e "${RED}失败: $FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    print_success "SKILL 安装验证通过！"
    echo ""
    echo "下一步操作："
    echo "1. 在 openclaw-desktop 前端测试 SKILL 功能"
    echo "2. 查看 Gateway 日志确认 SKILL 已加载"
    echo "3. 发送相关测试问题验证 SKILL 响应"
    echo ""
    echo "查看日志命令："
    echo "  openclaw gateway logs --tail 100 | grep '$SKILL_NAME'"
    exit 0
else
    print_error "SKILL 安装验证失败"
    echo ""
    echo "请根据上述错误信息修复问题后重新运行此脚本"
    exit 1
fi
