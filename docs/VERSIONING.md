# 版本管理规则

## 版本格式
本项目版本号完全跟随OpenClaw主版本，采用固定版本格式：`0.major.minor-preview-y`

### 各字段含义
- `major`：OpenClaw主版本号，例如OpenClaw版本为`3.8`时，此处`major`为`3`
- `minor`：OpenClaw小版本号，例如OpenClaw版本为`3.8`时，此处`minor`为`8`
- `y`：项目独立维护的预览版本号，从`1`开始递增，每次合并代码/发布新版本时递增1

## 版本号更新规则
1. 当OpenClaw主版本/小版本号更新时，同步更新`major`和`minor`字段，`y`重置为`1`
2. 日常贡献者提交代码/发布新版本时，仅递增`y`字段
3. 当前绑定版本：跟随OpenClaw 3.8版本，固定版本前缀为`0.3.8-preview-`
3. 版本号统一维护在`package.json`的`version`字段中

## 自动递增脚本
执行以下命令自动递增预览版本号（y字段）：
```bash
npm run version:bump-preview
```
