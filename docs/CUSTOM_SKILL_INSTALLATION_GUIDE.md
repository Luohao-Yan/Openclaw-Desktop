# 自定义 SKILL 包安装到指定 Agent 操作指南

_项目: openclaw-desktop_
_版本: 1.0_
_更新时间: 2026-03-23_

---

## 目录

1. [概述](#概述)
2. [步骤一：手动安装 SKILL 包到 Agent Workspace](#步骤一手动安装-skill-包到-agent-workspace)
3. [步骤二：SKILL 配置加载方法](#步骤二skill-配置加载方法)
4. [步骤三：验证 SKILL 安装成功](#步骤三验证-skill-安装成功)
5. [步骤四：在 openclaw-desktop 前端关联 SKILL 与 Agent](#步骤四在-openclaw-desktop-前端关联-skill-与-agent)
6. [常见问题排查](#常见问题排查)

---

## 概述

本指南提供将自定义 SKILL 包安装到指定 OpenClaw Agent 的完整操作流程。SKILL 是 OpenClaw 的功能扩展单元，允许 Agent 拥有特定领域的专业能力。

### 前置条件

- 已安装并配置好 OpenClaw Gateway
- 已创建目标 Agent（如 `fullstack-dev`）
- 已准备好自定义 SKILL 包（包含 `SKILL.md` 和必要脚本/代码）

---

## 步骤一：手动安装 SKILL 包到 Agent Workspace

### 1.1 确认目标 Agent Workspace 路径

每个 Agent 都有自己的独立 workspace，路径遵循以下规范：

```bash
# 基础路径
~/.openclaw/workspace-<agent-name>/

# 例如 fullstack-dev 的 workspace
~/.openclaw/workspace-fullstack-dev/
```

常用 Agent workspace 路径：
- `fullstack-dev`: `~/.openclaw/workspace-fullstack-dev/`
- `cto-development-director`: `~/.openclaw/workspace-cto-development-director/`
- `product-lead`: `~/.openclaw/workspace-product-lead/`
- `security-engineer`: `~/.openclaw/workspace-security-engineer/`

### 1.2 创建 SKILL 目录结构

在目标 Agent workspace 中创建 SKILL 目录：

```bash
# 目标 Agent：以 fullstack-dev 为例
AGENT_WORKSPACE="~/.openclaw/workspace-fullstack-dev"

# 创建 skills 目录（如果不存在）
mkdir -p "$AGENT_WORKSPACE/skills"

# 创建你的自定义 skill 目录
# 假设 skill 名为 "my-custom-skill"
SKILL_NAME="my-custom-skill"
SKILL_PATH="$AGENT_WORKSPACE/skills/$SKILL_NAME"
mkdir -p "$SKILL_PATH"

# 可选：创建子目录（用于存放脚本、代码、引用文档等）
mkdir -p "$SKILL_PATH/scripts"
mkdir -p "$SKILL_PATH/references"
mkdir -p "$SKILL_PATH/config"
```

### 1.3 复制 SKILL.md 核心文件

`SKILL.md` 是每个 SKILL 的核心配置文件，必须包含：

- `description`: SKILL 功能描述，用于 Agent 识别何时使用该 SKILL
- 具体的使用说明和调用方法
- 依赖的工具和参数说明

```bash
# 复制你的 SKILL.md 到目标位置
cp /path/to/your/skill/SKILL.md "$SKILL_PATH/SKILL.md"
```

**SKILL.md 模板示例：**

```markdown
# My Custom Skill

## 描述
当用户需要执行特定功能时使用此 Skill。支持 XXX 操作。

## 适用场景
- 场景 1：...
- 场景 2：...

## 使用方法
1. 调用工具 XXX
2. 处理结果
3. 返回格式化输出

## 依赖
- 工具 A：用途说明
- 工具 B：用途说明

## 参数说明
- param1: 说明
- param2: 说明
```

### 1.4 复制辅助脚本和代码（如果有）

如果你的 SKILL 包含可执行脚本或代码模块：

```bash
# 复制脚本文件
cp -r /path/to/your/skill/scripts/* "$SKILL_PATH/scripts/"

# 复制代码库
cp -r /path/to/your/skill/lib/* "$SKILL_PATH/"

# 复制配置文件
cp /path/to/your/skill/config/*.json "$SKILL_PATH/config/"

# 复制参考文档
cp -r /path/to/your/skill/references/* "$SKILL_PATH/references/"
```

### 1.5 设置执行权限（对于脚本文件）

```bash
# 为脚本文件添加执行权限
find "$SKILL_PATH/scripts" -type f -name "*.sh" -exec chmod +x {} \;
find "$SKILL_PATH/scripts" -type f -name "*.py" -exec chmod +x {} \;
```

### 1.6 完整安装命令示例

以下是将一个名为 "weather-service" 的 SKILL 安装到 `fullstack-dev` 的完整命令序列：

```bash
#!/bin/bash

# 配置变量
AGENT_NAME="fullstack-dev"
SKILL_NAME="weather-service"
SOURCE_SKILL_PATH="/tmp/my-weather-skill-package"

# 目标路径
AGENT_WORKSPACE="$HOME/.openclaw/workspace-$AGENT_NAME"
SKILL_PATH="$AGENT_WORKSPACE/skills/$SKILL_NAME"

# 验证源路径
if [ ! -d "$SOURCE_SKILL_PATH" ]; then
    echo "错误：源 SKILL 路径不存在: $SOURCE_SKILL_PATH"
    exit 1
fi

# 创建目录结构
echo "创建 SKILL 目录结构..."
mkdir -p "$SKILL_PATH/scripts"
mkdir -p "$SKILL_PATH/references"
mkdir -p "$SKILL_PATH/config"

# 复制文件
echo "复制 SKILL 文件..."
cp -r "$SOURCE_SKILL_PATH"/* "$SKILL_PATH/"

# 设置权限
echo "设置执行权限..."
find "$SKILL_PATH/scripts" -type f -exec chmod +x {} \; 2>/dev/null

# 验证安装
if [ -f "$SKILL_PATH/SKILL.md" ]; then
    echo "✅ SKILL 安装成功!"
    echo "   路径: $SKILL_PATH"
else
    echo "❌ 安装失败：SKILL.md 不存在"
    exit 1
fi
```

---

## 步骤二：SKILL 配置加载方法

### 2.1 OpenClaw SKILL 加载机制

OpenClaw 在以下时机加载 SKILL：

1. **启动时加载**：Agent 启动时自动扫描其 `skills/` 目录
2. **运行时扫描**：每次对话开始时，系统会检查 SKILL 的 `description` 字段
3. **动态匹配**：根据用户输入内容，系统自动判断应该使用哪个 SKILL

### 2.2 SKILL.md 关键字段说明

确保你的 `SKILL.md` 包含以下关键字段：

```markdown
# SKILL 名称

## 描述（必须）
这是最重要的字段。系统根据用户提问内容与该字段进行语义匹配。
应该清晰说明：
- SKILL 的核心功能
- 适用的场景列表
- 触发条件

**示例：**
当用户提到"天气"、"气温"、"降雨量"等关键词，或需要查询特定地点的气象信息时使用此 Skill。支持实时天气、未来天气预报、历史天气数据查询。

## 使用方法
详细说明 SKILL 的调用流程：
1. 解析用户输入
2. 调用特定工具或脚本
3. 处理返回结果
4. 格式化输出

## 依赖说明
列出 SKILL 依赖的工具、API 或外部服务

## 参数说明
说明 SKILL 支持的参数及其格式

## 注意事项
特殊说明或限制
```

### 2.3 确保 Agent 配置包含 skills 目录

检查 Agent 的配置文件（通常在 OpenClaw Gateway 配置中）：

```yaml
# agent 配置示例
agents:
  - name: fullstack-dev
    workspace: ~/.openclaw/workspace-fullstack-dev
    skills:
      - path: skills/  # 相对于 workspace 的路径
        enabled: true
```

### 2.4 强制重载 SKILL（如果需要）

在某些情况下，可能需要重启 Gateway 或 Agent 来重新加载 SKILL：

```bash
# 重启 OpenClaw Gateway
openclaw gateway restart

# 或者只重启特定 Agent（如果支持）
# 具体命令取决于 OpenClaw 版本
```

---

## 步骤三：验证 SKILL 安装成功

### 3.1 文件系统验证

检查 SKILL 文件是否正确放置：

```bash
# 验证目录结构
AGENT_WORKSPACE="$HOME/.openclaw/workspace-fullstack-dev"
SKILL_NAME="my-custom-skill"

echo "=== 检查 SKILL 目录 ==="
ls -la "$AGENT_WORKSPACE/skills/$SKILL_NAME/"

echo "=== 检查 SKILL.md ==="
if [ -f "$AGENT_WORKSPACE/skills/$SKILL_NAME/SKILL.md" ]; then
    echo "✅ SKILL.md 存在"
    echo "内容预览："
    head -20 "$AGENT_WORKSPACE/skills/$SKILL_NAME/SKILL.md"
else
    echo "❌ SKILL.md 不存在"
fi

echo "=== 检查脚本目录 ==="
ls -la "$AGENT_WORKSPACE/skills/$SKILL_NAME/scripts/" 2>/dev/null || echo "无脚本目录"

echo "=== 检查引用文档 ==="
ls -la "$AGENT_WORKSPACE/skills/$SKILL_NAME/references/" 2>/dev/null || echo "无引用文档"
```

### 3.2 通过对话验证（功能测试）

与目标 Agent 进行对话，测试 SKILL 是否被正确识别和调用：

**测试步骤：**

1. 打开 openclaw-desktop 前端界面
2. 选择已安装 SKILL 的 Agent（如 `fullstack-dev`）
3. 发送与 SKILL 功能相关的测试问题

**示例测试（假设安装了 weather SKILL）：**

```
用户：查询北京的实时天气

期望响应：
Agent 应该：
1. 识别到"天气"关键词
2. 加载 weather SKILL
3. 调用天气查询工具
4. 返回北京天气数据
```

### 3.3 查看 Agent 日志验证

通过 Gateway 日志查看 SKILL 是否被加载：

```bash
# 查看 Gateway 日志
openclaw gateway logs --tail 100

# 或者查看特定 Agent 的日志文件
tail -f ~/.openclaw/logs/gateway.log | grep "skill"
```

**期望看到的日志片段：**

```
[INFO] Loading skills for agent: fullstack-dev
[INFO] Found skill: my-custom-skill at /Users/xxx/.openclaw/workspace-fullstack-dev/skills/my-custom-skill
[INFO] Skill loaded: my-custom-skill
```

### 3.4 自动化验证脚本

创建一个验证脚本来自动检查 SKILL 安装：

```bash
#!/bin/bash

# verify_skill_install.sh
AGENT_NAME="fullstack-dev"
SKILL_NAME="my-custom-skill"

AGENT_WORKSPACE="$HOME/.openclaw/workspace-$AGENT_NAME"
SKILL_PATH="$AGENT_WORKSPACE/skills/$SKILL_NAME"

echo "================================"
echo "SKILL 安装验证工具"
echo "================================"
echo "Agent: $AGENT_NAME"
echo "SKILL: $SKILL_NAME"
echo "路径: $SKILL_PATH"
echo "================================"

# 检查 1：目录存在
if [ ! -d "$SKILL_PATH" ]; then
    echo "❌ 失败：SKILL 目录不存在"
    exit 1
fi
echo "✅ 通过：SKILL 目录存在"

# 检查 2：SKILL.md 存在
if [ ! -f "$SKILL_PATH/SKILL.md" ]; then
    echo "❌ 失败：SKILL.md 不存在"
    exit 1
fi
echo "✅ 通过：SKILL.md 存在"

# 检查 3：SKILL.md 包含必需字段
if ! grep -q "## 描述" "$SKILL_PATH/SKILL.md"; then
    echo "❌ 失败：SKILL.md 缺少 '描述' 字段"
    exit 1
fi
echo "✅ 通过：SKILL.md 包含必需字段"

# 检查 4：脚本权限（如果有）
if [ -d "$SKILL_PATH/scripts" ]; then
    SCRIPT_COUNT=$(find "$SKILL_PATH/scripts" -type f | wc -l)
    EXEC_COUNT=$(find "$SKILL_PATH/scripts" -type f -perm +111 | wc -l)
    echo "✅ 通过：发现 $SCRIPT_COUNT 个脚本，其中 $EXEC_COUNT 个有执行权限"
fi

# 检查 5：引用文档（可选）
if [ -d "$SKILL_PATH/references" ]; then
    REF_COUNT=$(find "$SKILL_PATH/references" -type f | wc -l)
    echo "✅ 通过：发现 $REF_COUNT 个引用文档"
fi

echo "================================"
echo "✅ 所有验证通过！SKILL 安装成功"
echo "================================"
```

使用验证脚本：

```bash
bash verify_skill_install.sh
```

---

## 步骤四：在 openclaw-desktop 前端关联 SKILL 与 Agent

### 4.1 理解 SKILL-Agent 关联机制

在 OpenClaw 中，SKILL 与 Agent 的关联有两种方式：

1. **自动关联**：SKILL 直接放置在 Agent 的 `skills/` 目录下，启动时自动加载
2. **前端配置关联**：通过 openclaw-desktop 的配置界面，将 SKILL 与 Agent 进行映射

### 4.2 通过 openclaw-desktop 配置界面关联

#### 方式 A：在 Agent 配置中添加 SKILL 路径

1. 打开 openclaw-desktop 应用
2. 进入 **设置** → **Agents** → **选择目标 Agent**（如 `fullstack-dev`）
3. 找到 **SKILLS** 或 **插件** 配置项
4. 点击 **添加 SKILL**
5. 输入 SKILL 信息：
   - **名称**：SKILL 标识符（如 `my-custom-skill`）
   - **路径**：SKILL 目录的绝对路径或相对于 workspace 的相对路径
   - **启用状态**：勾选启用
6. 保存配置

**配置示例（JSON）：**

```json
{
  "agent": "fullstack-dev",
  "skills": [
    {
      "name": "my-custom-skill",
      "path": "skills/my-custom-skill",
      "enabled": true,
      "priority": 10
    }
  ]
}
```

#### 方式 B：通过配置文件关联

编辑 Agent 的配置文件（通常在 `~/.openclaw/config/agents/` 目录下）：

```bash
# 找到 Agent 配置文件
ls ~/.openclaw/config/agents/

# 编辑对应 Agent 的配置
vi ~/.openclaw/config/agents/fullstack-dev.yaml
```

配置文件内容示例：

```yaml
agent:
  name: fullstack-dev
  workspace: ~/.openclaw/workspace-fullstack-dev

skills:
  - name: my-custom-skill
    path: skills/my-custom-skill
    enabled: true
    priority: 10

  - name: weather-service
    path: skills/weather-service
    enabled: true
    priority: 5
```

### 4.3 通过前端 UI 验证关联

在 openclaw-desktop 前端界面中验证 SKILL 是否已关联：

1. 打开 openclaw-desktop 应用
2. 进入 **设置** → **Agents**
3. 选择目标 Agent（如 `fullstack-dev`）
4. 查看 **已安装 SKILL** 列表
5. 确认你的自定义 SKILL 在列表中且状态为"已启用"

**期望看到的界面元素：**

```
Agent: fullstack-dev
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
已安装 SKILL:
┌─────────────────────────────┐
│ ☑ my-custom-skill    [启用] │
│ ☑ weather-service    [启用] │
│ ☐ another-skill      [禁用] │
└─────────────────────────────┘
```

### 4.4 通过 API 验证关联（高级）

如果 openclaw-desktop 提供配置 API，可以通过 API 验证：

```获取已配置的 SKILL 列表

GET /api/agents/fullstack-dev/skills

响应示例：
{
  "success": true,
  "data": {
    "agent": "fullstack-dev",
    "skills": [
      {
        "name": "my-custom-skill",
        "path": "skills/my-custom-skill",
        "enabled": true,
        "loaded": true,
        "description": "当用户需要执行特定功能时使用此 Skill..."
      }
    ]
  }
}
```

---

## 常见问题排查

### 问题 1：SKILL 安装后 Agent 无法识别

**可能原因：**
- SKILL.md 文件名错误或格式不正确
- Gateway 未重启，SKILL 未重新加载
- SKILL.md 缺少必需的"描述"字段

**解决方法：**

```bash
# 1. 验证 SKILL.md 存在且命名正确
ls -la ~/.openclaw/workspace-fullstack-dev/skills/my-custom-skill/SKILL.md

# 2. 检查 SKILL.md 是否包含描述字段
grep "## 描述" ~/.openclaw/workspace-fullstack-dev/skills/my-custom-skill/SKILL.md

# 3. 重启 Gateway
openclaw gateway restart

# 4. 检查日志
openclaw gateway logs --tail 50 | grep "skill"
```

### 问题 2：脚本文件无执行权限

**症状：**
Agent 尝试调用 SKILL 脚本时报错：Permission denied

**解决方法：**

```bash
# 添加执行权限
chmod +x ~/.openclaw/workspace-fullstack-dev/skills/my-custom-skill/scripts/*.sh
chmod +x ~/.openclaw/workspace-fullstack-dev/skills/my-custom-skill/scripts/*.py
```

### 问题 3：SKILL 在多个 Agent 间共享

**场景：**
同一个 SKILL 需要安装到多个 Agent

**解决方案 1：使用符号链接**

```bash
# 创建一个中心化的 SKILL 库
mkdir -p ~/.openclaw/shared-skills
cp -r /path/to/skill ~/.openclaw/shared-skills/my-skill

# 在多个 Agent 中创建符号链接
ln -s ~/.openclaw/shared-skills/my-skill ~/.openclaw/workspace-fullstack-dev/skills/my-skill
ln -s ~/.openclaw/shared-skills/my-skill ~/.openclaw/workspace-security-engineer/skills/my-skill
```

**解决方案 2：复制到每个 Agent**

```bash
# 使用安装脚本批量安装
for agent in fullstack-dev security-engineer product-lead; do
    cp -r /path/to/skill ~/.openclaw/workspace-$agent/skills/my-skill
done
```

### 问题 4：SKILL 依赖的外部工具未安装

**症状：**
Agent 调用 SKILL 时提示找不到命令或工具

**解决方法：**

1. 在 SKILL.md 中明确列出依赖的工具
2. 提供依赖安装脚本
3. 在 SKILL 中添加依赖检查逻辑

**示例：在 SKILL.md 中添加依赖说明**

```markdown
## 依赖工具

安装以下工具才能使用此 SKILL：

```bash
# macOS
brew install jq curl

# Linux
apt-get install jq curl

# 验证安装
jq --version
curl --version
```

如果未安装，SKILL 会自动提示用户安装。
```

### 问题 5：SKILL 加载但未被调用

**可能原因：**
- SKILL.md 的"描述"字段不够明确
- 描述与用户提问的语义匹配度低

**解决方法：**

优化 SKILL.md 的描述字段：

```markdown
## 描述（优化前）
这个 SKILL 用于查询天气

## 描述（优化后）
当用户提到"天气"、"气温"、"降雨量"、"湿度"、"风速"、"气象"、"forecast"等关键词，
或需要查询特定地点/城市的实时天气、未来几天天气预报、历史气象数据时使用此 Skill。
支持按城市名、经纬度、IP 地址定位查询。
```

---

## 附录

### A. 示例 SKILL 目录结构

```
skills/my-custom-skill/
├── SKILL.md              # 核心：必须包含
├── README.md             # 可选：详细文档
├── scripts/              # 可选：辅助脚本
│   ├── helper.sh
│   └── data_processor.py
├── references/           # 可选：参考文档
│   ├── api-spec.pdf
│   └── examples.md
├── config/               # 可选：配置文件
│   └── settings.json
└── lib/                  # 可选：代码库
    └── utils.js
```

### B. 快速安装命令速查

```bash
# 1. 创建 SKILL 目录
mkdir -p ~/.openclaw/workspace-fullstack-dev/skills/my-skill

# 2. 复制 SKILL.md
cp /path/to/SKILL.md ~/.openclaw/workspace-fullstack-dev/skills/my-skill/

# 3. 设置脚本权限
chmod +x ~/.openclaw/workspace-fullstack-dev/skills/my-skill/scripts/*

# 4. 验证安装
test -f ~/.openclaw/workspace-fullstack-dev/skills/my-skill/SKILL.md && echo "✅ 安装成功"

# 5. 重启 Gateway
openclaw gateway restart
```

### C. 相关文档链接

- OpenClaw 官方文档：`https://docs.openclaw.dev`
- SKILL 开发规范：`https://docs.openclaw.dev/skills/spec`
- Agent 配置参考：`https://docs.openclaw.dev/agents/config`

---

## 反馈与支持

如遇到本指南未覆盖的问题，请：

1. 收集详细的错误信息和日志
2. 提供 SKILL.md 内容（脱敏后）
3. 记录操作步骤和环境信息
4. 通过以下渠道寻求支持：
   - OpenClaw 社区论坛
   - GitHub Issues
   - 技术支持邮件

---

_文档结束_
