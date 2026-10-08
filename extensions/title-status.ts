/**
 * Title Status Extension
 *
 * 在终端标题栏显示 pi 任务状态（多开时每个实例只控制自己的终端标签页）：
 * - 运行中：⠋ 旋转动画前缀
 * - 完成等待输入：🔴 红点常驻 + 响铃（Windows Terminal 未聚焦标签显示铃铛图标）
 * - 红点清除时机：用户产生"有效输入"（可打印字符 / 回车 / 退格 / 粘贴）的第一下击键即消；
 *   方向键、Ctrl 组合键、鼠标等纯转义序列不算
 * - 基础标题默认镜像 pi 原生格式：π - {session名} - {目录名}
 *
 * 安装：pi install npm:pi-title-status
 *
 * 配置（可选）：~/.pi/agent/pi-title-status.json（若设了 PI_CODING_AGENT_DIR 则在其下）
 *   {
 *     "doneMark": "🔴",                          // 空闲标记，可改 ✅ / [done] 等
 *     "bell": true,                              // 空闲时是否响铃
 *     "spinIntervalMs": 100,                     // 旋转帧间隔（下限 20ms）
 *     "template": "{mark}{app} - {session} - {cwd}"  // 完整标题模板
 *   }
 * 占位符：{mark} 状态标记（spinner/红点，自带尾随空格）、{app} 应用名、{session} 会话名、{cwd} 目录名
 * 缺省字段用默认值；文件缺失或字段类型错误不影响其他字段；JSON 语法错误则整体回退默认并提示一次。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const APP_TITLE = "π"; // 与 pi 内置 updateTerminalTitle 的前缀一致
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MIN_SPIN_INTERVAL_MS = 20; // 再低只是徒增终端转义序列洪峰

interface TitleConfig {
	doneMark: string;
	bell: boolean;
	spinIntervalMs: number;
	template: string;
}

const DEFAULTS: TitleConfig = {
	doneMark: "🔴",
	bell: true,
	spinIntervalMs: 100,
	template: "{mark}{app} - {session} - {cwd}",
};

function configPath(): string {
	const dir = process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
	return path.join(dir, "pi-title-status.json");
}

/** 读配置：文件不存在 = 全默认；语法错误 = 全默认 + 报错信息；字段非法 = 该字段回默认 */
function loadConfig(): { config: TitleConfig; error?: string } {
	let raw: string;
	try {
		raw = fs.readFileSync(configPath(), "utf8");
	} catch {
		return { config: { ...DEFAULTS } };
	}
	let parsed: Partial<TitleConfig>;
	try {
		parsed = JSON.parse(raw) as Partial<TitleConfig>;
	} catch (e) {
		return { config: { ...DEFAULTS }, error: `pi-title-status: 配置解析失败，已回退默认值（${e instanceof Error ? e.message : e}）` };
	}
	return {
		config: {
			doneMark: typeof parsed.doneMark === "string" && parsed.doneMark !== "" ? parsed.doneMark : DEFAULTS.doneMark,
			bell: typeof parsed.bell === "boolean" ? parsed.bell : DEFAULTS.bell,
			spinIntervalMs:
				typeof parsed.spinIntervalMs === "number" && parsed.spinIntervalMs >= MIN_SPIN_INTERVAL_MS
					? Math.floor(parsed.spinIntervalMs)
					: DEFAULTS.spinIntervalMs,
			template: typeof parsed.template === "string" && parsed.template !== "" ? parsed.template : DEFAULTS.template,
		},
	};
}

// ---- "有效输入"判定：剥掉终端转义序列后，剩下的才是真实击键内容 ----
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g;
const CSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g; // 覆盖方向键、kitty 键序列、SGR 鼠标 \x1b[<...M 等
const SS3_RE = /\x1bO[@-~]/g; // 应用模式方向键等
const ESC1_RE = /\x1b[@-_]/g; // 其余 ESC + 单字节序列

function isMeaningfulInput(data: string): boolean {
	const s = data.replace(OSC_RE, "").replace(CSI_RE, "").replace(SS3_RE, "").replace(ESC1_RE, "");
	for (const ch of s) {
		const code = ch.codePointAt(0) ?? 0;
		if (code >= 0x20 && code !== 0x7f) return true; // 可打印字符（含空格、CJK 等 Unicode）
		if (code === 0x0d || code === 0x0a || code === 0x7f) return true; // Enter / Ctrl+J 换行 / Backspace
	}
	return false;
}

export default function (pi: ExtensionAPI) {
	let timer: ReturnType<typeof setInterval> | null = null;
	let frame = 0;
	let dotVisible = false;
	let nameCache: string | undefined;
	let unsubscribeInput: (() => void) | null = null;
	let config: TitleConfig = DEFAULTS;
	let lastNotifiedError: string | undefined;

	function reloadConfig(): string | undefined {
		const result = loadConfig();
		config = result.config;
		return result.error;
	}
	reloadConfig();

	function renderTitle(mark: string | null): string {
		let t = config.template
			.replaceAll("{mark}", mark ? `${mark} ` : "")
			.replaceAll("{app}", APP_TITLE)
			.replaceAll("{session}", nameCache ?? "")
			.replaceAll("{cwd}", path.basename(process.cwd()));
		// 会话名为空等情况下，折叠占位符留下的空段（"π -  - dir" -> "π - dir"）
		while (t.includes(" -  - ")) t = t.replaceAll(" -  - ", " - ");
		return t.replace(/^(?: - )+|(?: - )+$/g, "");
	}

	function refreshNameCache(): void {
		try {
			nameCache = pi.getSessionName();
		} catch {
			// session 替换后旧实例的 runtime 已失效，沿用缓存
		}
	}

	function stopSpinner(): void {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	function ringBell(ctx: ExtensionContext): void {
		// 只允许在 TUI 模式直接写 BEL：RPC 模式 stdout 走 JSON 协议，print 模式会污染输出
		if (ctx.mode === "tui") {
			process.stdout.write("\x07");
		}
	}

	function showDot(ctx: ExtensionContext): void {
		const firstTime = !dotVisible;
		stopSpinner();
		dotVisible = true;
		ctx.ui.setTitle(renderTitle(config.doneMark));
		if (config.bell && firstTime) {
			ringBell(ctx);
		}
	}

	function clearDot(ctx: ExtensionContext): void {
		if (!dotVisible) return;
		dotVisible = false;
		ctx.ui.setTitle(renderTitle(null));
	}

	pi.on("session_start", async (_event, ctx) => {
		// 新会话重读配置，改完文件重启会话即生效
		// 配置坏了要提醒，但同一条错误只提示一次（修了或换了新错才会再提示）
		const configError = reloadConfig();
		if (configError && configError !== lastNotifiedError) {
			ctx.ui.notify(configError, "warning");
			lastNotifiedError = configError;
		}
		refreshNameCache();
		dotVisible = false;
		stopSpinner();
		// 不在这里 setTitle：pi 自己的 updateTerminalTitle 会设置，格式一致，无需抢写
		// 注册终端原始输入监听（interactive 模式专属），用于"有效输入"即时清红点
		unsubscribeInput?.();
		unsubscribeInput = null;
		if (ctx.mode === "tui") {
			unsubscribeInput = ctx.ui.onTerminalInput((data) => {
				if (dotVisible && isMeaningfulInput(data)) {
					clearDot(ctx);
				}
				return undefined; // 不消费、不修改输入
			});
		}
	});

	// 任务开始 -> 旋转动画（用户既然发了新任务，红点自然清除）
	pi.on("agent_start", async (_event, ctx) => {
		refreshNameCache();
		dotVisible = false;
		stopSpinner();
		// spinner 只在 TUI 模式有意义：RPC 模式每个 100ms 发一次 setTitle 是纯噪音
		if (ctx.mode !== "tui") return;
		frame = 0;
		timer = setInterval(() => {
			const mark = SPINNER[frame++ % SPINNER.length];
			ctx.ui.setTitle(renderTitle(mark));
		}, config.spinIntervalMs);
	});

	// pi 完全空闲（无自动重试、无排队 follow-up）-> 完成标记 + 响铃，等用户回来
	pi.on("agent_settled", async (_event, ctx) => {
		showDot(ctx);
	});

	// 改名事件：event.name 即最新名字（undefined = 已清除），无需调 API
	// pi 原生 updateTerminalTitle 先于扩展 handler 执行，因此这里重绘能覆盖回红点
	pi.on("session_info_changed", async (event, ctx) => {
		nameCache = event.name;
		if (timer) return; // spinner 下一帧自动带出新名字
		ctx.ui.setTitle(dotVisible ? renderTitle(config.doneMark) : renderTitle(null));
	});

	// 提交 prompt 的兜底清除（覆盖 Ctrl+Enter 等纯转义序列提交，击键过滤识别不出）
	pi.on("input", async (event, ctx) => {
		if (event.source === "interactive") {
			clearDot(ctx);
		}
		return { action: "continue" as const };
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		stopSpinner();
		unsubscribeInput?.();
		unsubscribeInput = null;
		try {
			ctx.ui.setTitle(renderTitle(null));
		} catch {
			// session 替换后旧 UI 可能已失效
		}
	});
}
