# OpenClaw Desktop - Skills 安装与管理指南

> **版本**: 1.0  
> **最后更新**: 2026-03-23  
> **适用版本**: OpenClaw Desktop v1.0+

---

## 📋 目录

- [一、概述](#一概述)
- [二、本地开发环境安装](#二本地开发环境安装)
- [三、项目内置技能加载](#三项目内置技能加载)
- [四、ClawHub 公共技能安装](#四clawhub-公共技能安装)
- [五、前端 UI 界面说明](#五前端-ui-界面说明)
- [六、验证安装成功](#六验证安装成功)
- [七、常见问题](#七常见问题)

---

## 一、概述

OpenClaw Desktop 提供了完整的 Skills 管理功能，支持三种技能来源：

1. **本地技能** - 已安装在本地的 Agent 技能
2. **ClawHub 技能市场** - 通过 ClawHub 搜索并安装公共技能
3. **插件技能** - 通过 npm 安装和管理的插件类型技能

---

## 二、本地开发环境安装

### 2.1 安装 OpenClaw CLI

在使用桌面客户端之前，必须先安装 OpenClaw CLI：

```bash
# 全局安装 OpenClaw CLI
npm install -g openclaw

# 验证安装
openclaw --version
```

**注意事项**:
- OpenClaw Desktop 会自动检测本地 CLI 安装情况
- 如果未检测到 CLI，应用会提示你完成安装
- CLI 版本需要与桌面客户端版本兼容

### 2.2 查看本地 Skills 目录

OpenClaw 的技能通常存储在以下位置：

- **macOS/Linux**: `~/.openclaw/extensions/`
- **Windows**: `%USERPROFILE%\.openclaw\extensions\`

```bash
# 查看已安装的技能
ls -la ~/.openclaw/extensions/

# 查看某个技能的详情
cat ~/.openclaw/extensions/feishu-bitable/SKILL.md
```

### 2.3 手动安装本地技能

如果你有技能的源码，可以手动安装到 extensions 目录：

```bash
# 1. 克隆或下载技能源码
git clone https://github.com/your-org/your-skill.git

# 2. 复制到 OpenClaw extensions 目录
cp -r your-skill ~/.openclaw/extensions/

# 3. 确保技能目录包含 SKILL.md 文件
ls ~/.openclaw/extensions/your-skill/SKILL.md
```

---

## 三、项目内置技能加载

### 3.1 内置技能说明

OpenClaw Desktop 项目本身也内置了一些技能，这些技能通常用于：

- 桌面客户端特定的功能扩展
- 开发工具和调试工具
- 项目专用的业务逻辑

### 3.2 项目技能目录结构

```text
openclaw-desktop/
├── skills/                        # 项目内置技能目录（如有）
│   ├── desktop-tools/             # 桌面工具技能
│   │   ├── SKILL.md               # 技能定义文件
│   │   ├── references/             # 参考资源
│   │   └── scripts/               # 脚本文件
│   └── dev-utils/                 # 开发工具技能
│       └── SKILL.md
└── ...
```

### 3.3 加载内置技能

内置技能通过以下方式加载：

1. **启动时自动加载**: 桌面客户端启动时会扫描 `skills/` 目录
2. **配置文件指定**: 在应用配置中指定要加载的技能列表
3. **用户手动启用**: 通过 UI 界面手动启用/禁用内置技能

```javascript
// 配置示例 (config/skills.json)
{
  "enabledSkills": [
    "desktop-tools",
    "dev-utils"
  ],
  "disabledSkills": []
}
```

---

## 四、ClawHub 公共技能安装

### 4.1 ClawHub 简介

ClawHub 是 OpenClaw 的公共技能市场，提供社区贡献的技能。你可以通过桌面客户端直接搜索和安装这些技能。

### 4.2 通过桌面客户端安装

**步骤 1: 打开技能管理页面**

1. 启动 OpenClaw Desktop 应用
2. 在左侧导航栏点击 **"Skills"** 图标（书本图标 📚）
3. 进入技能管理页面

**步骤 2: 切换到"市场搜索"标签**

- 点击顶部标签页的 **"市场搜索"** 按钮
- 在搜索框中输入关键词（如：`feishu`、`github`、`weather`）

**步骤 3: 搜索技能**

- 输入关键词后按 **Enter** 键或点击 **"搜索"** 按钮
- 系统会从 ClawHub 搜索匹配的技能
- 搜索结果会以卡片形式展示

**步骤 4: 安装技能**

- 找到你需要的技能，点击卡片上的 **"安装"** 按钮
- 等待安装完成（按钮会显示"安装中..."）
- 安装成功后会显示绿色的成功提示

### 4.3 通过 CLI 安装

你也可以通过 OpenClaw CLI 直接安装 ClawHub 技能：

```bash
# 使用 clawhub CLI 安装技能
clawhub install <skill-name>

# 示例：安装飞书多维表格技能
clawhub install feishu-bitable

# 查看已安装的技能
clawhub list

# 更新技能到最新版本
clawhub sync

# 同步所有已安装的技能到最新版本
clawhub sync --all
```

### 4.4 ClawHub 技能来源

ClawHub 技能主要托管在以下位置：

- **官方技能库**: `https://github.com/openclaw/skills`
- **社区贡献**: GitHub 上带有 `openclaw-skill` topic 的仓库
- **私有仓库**: 企业内部自托管的技能仓库

---

## 五、前端 UI 界面说明

### 5.1 技能管理入口位置

**主入口路径**:
```
左侧导航栏 → Skills (技能管理)
```

**具体位置**:
- 在桌面应用左下角的导航栏中
- 找到 **Skills** 图标（书本图标 📚）
- 点击即可进入技能管理页面

### 5.2 技能管理页面布局

技能管理页面采用 **标签页布局**，包含三个主要标签：

1. **本地技能** - 查看和管理已安装的本地技能
2. **市场搜索** - 从 ClawHub 搜索并安装公共技能
3. **插件** - 管理插件类型的技能

#### 5.2.1 页面顶部操作栏

根据当前标签页不同，顶部显示不同的操作按钮：

**本地技能 / 市场搜索标签**:
- **诊断** - 运行技能诊断，检查技能状态和依赖
- **刷新** - 刷新技能列表，重新加载
- **创建技能** - 创建新的自定义技能

**插件标签**:
- **插件诊断** - 诊断插件状态
-问题修复** - 刷新插件列表
- **安装插件** - 安装新的插件

### 5.3 本地技能页面交互

#### 5.3.1 技能列表展示

- 以卡片形式展示所有本地技能
- 每个卡片显示：
  - 技能图标（emoji）
  - 技能名称
  - 技能状态（已安装/可安装/可更新/错误）
  - 技能描述
  - 是否为自定义技能
  - 缺失依赖警告

#### 5.3.2 技能卡片交互

**点击卡片**:
- 选中该技能，右侧显示技能详情面板
- 再次点击取消选中

**操作按钮**（仅自定义技能显示）:
- **编辑** (✏️): 编辑技能配置
- **删除** (🗑️): 删除该技能

#### 5.3.3 技能详情面板

选中技能后，右侧滑出详情面板，包含：

- **技能信息**: 名称、描述、版本、作者
- **技能文件**: SKILL.md 内容预览
- **依赖项**: 查看和编辑 requires 配置
- **操作按钮**:
  - **编辑配置**: 打开配置编辑器
  - **刷新**: 重新加载技能信息
  - **关闭**: 关闭详情面板

### 5.4 市场搜索页面交互

#### 5.4.1 搜索流程

1. 在搜索框输入关键词
2. 按 **Enter** 或点击 **"搜索"** 按钮
3. 搜索结果以卡片网格展示
4. 每个卡片显示技能信息和安装状态

#### 5.4.2 安装技能

- 点击技能卡片上的 **"安装"** 按钮
- 等待安装完成
- 安装成功后：
  - 按钮变为"已安装"
  - 自动刷新本地技能列表
  - 显示成功提示

#### 5.4.3 缺失依赖提示

如果技能有缺失依赖，安装后会弹出引导对话框：

- 显示缺失的依赖列表
- 提供安装命令
- 一键安装缺失依赖

### 5.5 插件页面交互

#### 5.5.1 插件管理功能

插件页面提供以下功能：

- **插件列表**: 显示已安装的 npm 插件
- **安装插件**: 通过 npm 安装新插件
- **插件诊断**: 检查插件状态和版本
- **更新插件**: 更新插件到最新版本
- **卸载插件**: 卸载已安装的插件

#### 5.5.2 安装插件

1. 点击顶部 **"安装插件"** 按钮
2. 输入插件名称（如：`@openclaw/feishu`）
3. 点击安装
4. 等待安装完成

### 5.6 创建自定义技能

**步骤 1: 打开创建对话框**

- 在顶部操作栏点击 **"创建技能"** 按钮
- 弹出创建技能对话框

**步骤 2: 填写技能信息**

- 技能名称（必填，英文小写+连字符）
- 技能描述（必填）
- 技能 emoji（可选）
- 初始 SKILL.md 内容（可选）

**步骤 3: 创建完成**

- 点击 **"创建"** 按钮
- 系统会在 `~/.openclaw/extensions/` 下创建技能目录
- 自动刷新技能列表

### 5.7 技能诊断功能

**启动诊断**:

- 点击顶部 **"诊断"** 按钮
- 弹出诊断面板

**诊断内容**:

- 技能文件完整性检查
- SKILL.md 语法验证
- 依赖项缺失检查
- 文件监听状态
- 技能加载状态

**诊断结果**:

- ✅ 通过：所有检查项正常
- ⚠️ 警告：有非致命问题
- ❌ 失败：有严重错误需要修复

---

## 六、前端代码实现路径

### 6.1 核心页面组件

**主页面**: `src/pages/Skills.tsx`
- 负责技能管理页面的整体布局
- 管理三个标签页的状态切换
- 协调各个子组件的交互

**关键功能**:
- 技能列表加载和刷新
- 市场搜索功能
- 文件本监听和自动刷新
- 对话框状态管理

### 6.2 技能相关子组件

所有技能相关子组件位于 `src/components/skills/` 目录：

| 组件文件 | 功能说明 |
|---------|---------|
| `CreateSkillDialog.tsx` | 创建自定义技能对话框 |
| `EditSkillDialog.tsx` | 编辑技能对话框 |
| `DeleteSkillConfirm.tsx` | 删除技能确认对话框 |
| `SkillDetailPanel.tsx` | 技能详情面板（右侧滑出） |
| `SkillConfigEditor.tsx` | 技能配置编辑器 |
| `PluginsTab.tsx` | 插件管理标签页 |
| `DiagnosticsPanel.tsx` | 技能诊断面板 |

### 6.3 主要组件说明

#### 6.3.1 Skills.tsx（主页面）

**路径**: `src/pages/Skills.tsx`

**核心状态**:
```typescript
- activeTab: 'local' | 'market' | 'plugins'  // 当前标签页
- skills: SkillInfo[]                          // 本地技能列表
- selectedSkill: SkillInfo | null             // 选中的技能
- marketResults: SkillInfo[]                  // 市场搜索结果
```

**主要方法**:
- `loadSkills()`: 加载本地技能列表
- `handleMarketSearch()`: 执行市场搜索
- `handleMarketInstall()`: 安装市场技能

#### 6.3.2 SkillDetailPanel.tsx（详情面板）

**路径**: `src/components/skills/SkillDetailPanel.tsx`

**功能**:
- 显示技能完整信息
- 显示 SKILL.md 内容
- 展示依赖项列表
- 提供编辑配置入口

**主要 Props**:
```typescript
interface Props {
  skill: SkillInfo;           // 技能信息
  onClose: () => void;        // 关闭回调
  onRefresh: () => void;      // 刷新回调
  onEdit: (id: string) => void;       // 编辑回调
  onEditConfig: (id: string) => void; // 编辑配置回调
}
```

#### 6.3.3 CreateSkillDialog.tsx（创建对话框）

**路径**: `src/components/skills/CreateSkillDialog.tsx`

**功能**:
- 创建新的自定义技能
- 验证技能名称格式
- 生成初始 SKILL.md 模板

**表单字段**:
- 技能名称（自动验证格式）
- 技能描述
- 技能 emoji
- 初始 SKILL.md 内容

#### 6.3.4 PluginsTab.tsx（插件标签页）

**路径**: `src/components/skills/PluginsTab.tsx`

**功能**:
- 管理已安装的插件
- 安装新插件（通过 npm）
- 插件诊断和更新

**与父组件交互**:
```typescript
// 外部控制信号
- installTrigger: number     // 触发安装对话框
- doctorTrigger: number      // 触发诊断
- refreshTrigger: number     // 触发刷新

// 状态回调
- onLoadingChange: (loading: boolean) => void
- onDoctorLoadingChange: (loading: boolean) => void
```

### 6.4 IPC 通信接口

前端通过 Electron IPC 与后端通信，主要接口定义在 `src/types/electron.ts`：

**技能相关接口**:
```typescript
// 获取所有技能
window.electronAPI.skillsGetAll()

// ClawHub 搜索
window.electronAPI.skillsClawHubSearch(query: string)

// 安装技能
window.electronAPI.skillsInstall(skillId: string)

// 安装依赖
window.electronAPI.skillsInstallDependency({ command, args })

// 启动文件监听
window.electronAPI.skillsStartWatcher()

// 停止文件监听
window.electronAPI.skillsStopWatcher()

// 监听技能变化事件
window.electronAPI.onSkillsChanged?.(callback)
```

### 6.5 数据模型

**SkillInfo 类型定义**:
```typescript
interface SkillInfo {
  id: string;                      // 技能 ID
  name: string;                    // 技能名称
  description?: string;            // 技能描述
  emoji?: string;                  // 技能图标
  version?: string;                // 版本号
  author?: string;                 // 作者
  category?: string;               // 分类
  status: 'installed' | 'available' | 'updatable' | 'error'; // 状态
  source?: 'local' | 'clawhub' | 'custom';  // 来源
  isCustom?: boolean;              // 是否为自定义技能
  requires?: string[];             // 依赖项
  missingRequirements?: string[];   // 缺失的依赖
}
```

---

## 七、验证安装成功

### 7.1 通过 UI 界面验证

1. **检查技能列表**:
   - 进入 Skills 页面的"本地技能"标签
   - 查看技能是否出现在列表中
   - 检查技能状态是否为"已安装"

2. **检查技能状态**:
   - 点击技能卡片打开详情面板
   - 查看技能的版本、描述等信息
   - 检查是否有缺失依赖警告

3. **运行诊断**:
   - 点击顶部 **"诊断"** 按钮
   - 查看诊断结果
   - 确认没有严重错误

### 7.2 通过 CLI 验证

```bash
# 列出所有已安装的技能
clawhub list

# 查看特定技能信息
cat ~/.openclaw/extensions/your-skill/SKILL.md

# 检查依赖是否满足
openclaw --help | grep your-skill
```

### 7.3 功能测试

安装技能后，可以通过以下方式测试功能：

1. **Agent 对话测试**:
   - 打开 Agent 聊天界面
   - 触发需要该技能的对话
   - 观察 Agent 是否能正常调用技能

2. **日志检查**:
   - 在桌面应用的"日志中心"查看技能加载日志
   - 确认技能被正确加载

---

## 八、常见问题

### Q1: 技能安装失败怎么办？

**A**: 检查以下几点：

1. 确认 OpenClaw CLI 已正确安装：`openclaw --version`
2. 检查网络连接是否正常
3. 查看桌面应用的日志中心，获取详细错误信息
4. 尝试通过 CLI 手动安装：`clawhub install <skill-name>`

### Q2: 技能显示"缺失依赖"如何解决？

**A**:

1. 点击技能卡片上的依赖警告
2. 在弹出的引导对话框中点击"安装"按钮
3. 或通过 CLI 手动安装依赖：
   ```bash
   npm install -g <missing-package>
   ```

### Q3: 如何更新技能到最新版本？

**A**:

1. **通过 UI**:
   - 在"本地技能"标签页中，技能状态会显示"可更新"
   - 点击技能卡片，在详情面板中查找更新选项

2. **通过 CLI**:
   ```bash
   # 更新所有技能
   clawhub sync --all

   # 更新特定技能
   clawhub sync <skill-name>
   ```

### Q4: 自定义技能如何创建？

**A**:

1. 点击 Skills 页面顶部的 **"创建技能"** 按钮
2. 填写技能信息（名称、描述、emoji）
3. 系统会自动创建技能目录和初始 SKILL.md 文件
4. 你可以手动编辑 SKILL.md 添加更多内容

### Q5: 技能文件修改后如何刷新？

**A**:

OpenClaw Desktop 支持文件监听功能：

1. 当你修改技能文件时，系统会自动检测到变化
2. 技能列表会自动刷新
3. 如果未自动刷新，点击页面顶部的 **"刷新"** 按钮

### Q6: ClawHub 搜索不到技能怎么办？

**A**:

1. 检查网络连接
2. 尝试使用不同的搜索关键词
3. 访问 ClawHub 官方仓库查看可用技能列表
4. 确认技能名称拼写正确

---

## 九、技术支持

如遇到问题或需要帮助，请通过以下方式联系：

- **GitHub Issues**: [提交 Issue](https://github.com/Luohao-Yan/Openclaw-Desktop/issues)
- **文档**: 查看项目 README 和 docs 目录
- **社区**: 加入 OpenClaw 社区讨论

---

**文档版本**: 1.0  
**最后更新**: 2026-03-23  
**维护者**: OpenClaw Desktop Team
