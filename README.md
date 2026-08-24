# pi-title-status

pi 的终端标题栏状态扩展：任务运行时显示 braille spinner，空闲时显示 🔴 并响铃（Windows Terminal 未聚焦标签会显示铃铛图标）。

## 安装

```bash
pi install git:github.com/waqiju/pi-title-status@v0.1.0
```

## 升级到新版本

```bash
pi install git:github.com/waqiju/pi-title-status@v0.2.0
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

## 本地开发

```bash
# 临时加载（不安装）
pi -e ./extensions/title-status.ts
```
