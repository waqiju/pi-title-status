# pi-title-status

![preview](https://raw.githubusercontent.com/waqiju/pi-title-status/main/docs/preview.png)

pi 的终端标题栏状态扩展：任务运行时显示 braille spinner，空闲时显示 🔴 并响铃（Windows Terminal 未聚焦标签会显示铃铛图标）。

## 安装

从 npm 安装（推荐）：

```bash
pi install npm:pi-title-status
```

也可以从 git 安装指定版本：

```bash
pi install git:github.com/waqiju/pi-title-status@v0.2.0
```

## 升级

```bash
pi update npm:pi-title-status
```

或安装指定新版本：

```bash
pi install npm:pi-title-status@0.2.0
```

## 行为

| 状态 | 标题 |
|------|------|
| 运行中 | `⠋ π - {session} - {目录}`（100ms 旋转） |
| 空闲等待 | `🔴 π - {session} - {目录}` + 响铃 |
| 用户开始输入 | 红点即消，回到 `π - {session} - {目录}` |

- 基础标题完全镜像 pi 原生格式。
- 多开时每个实例只控制自己的终端标签页。
- 红点清除时机：第一下"有效输入"（可打印字符 / 回车 / 退格 / 粘贴）即消；方向键、Ctrl 组合键、鼠标等纯转义序列不算。

## 配置（可选）

不配也能用。想改默认行为，新建 `~/.pi/agent/pi-title-status.json`（若设了 `PI_CODING_AGENT_DIR` 则放在该目录下）：

```json
{
  "doneMark": "🔴",
  "bell": true,
  "spinIntervalMs": 100,
  "template": "{mark}{app} - {session} - {cwd}"
}
```

| 字段 | 默认 | 说明 |
|------|------|------|
| `doneMark` | `🔴` | 空闲标记，可改 `✅` / `[done]` 等 |
| `bell` | `true` | 空闲时是否响铃 |
| `spinIntervalMs` | `100` | 旋转帧间隔，下限 20ms |
| `template` | `{mark}{app} - {session} - {cwd}` | 完整标题模板 |

模板占位符：`{mark}` 状态标记（spinner/红点，自带尾随空格）、`{app}` 应用名 `π`、`{session}` 会话名、`{cwd}` 目录名。会话名为空时 ` -  - ` 空段会自动折叠。

只写想改的字段即可，其余用默认值；新会话生效。JSON 语法错误会整体回退默认值并提示一次。

### 已知限制

启动（或 `/new`、session 切换）后到第一次任务开始前，标题显示 pi 原生格式而非自定义 template——pi 会在扩展的 `session_start` 之后才写入原生标题，扩展无法抢在前面。第一次任务运行后即按 template 渲染。

## 本地开发

```bash
# 临时加载（不安装）
pi -e ./extensions/title-status.ts
```
