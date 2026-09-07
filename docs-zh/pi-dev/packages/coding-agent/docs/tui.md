本文是 `tui.md` 的中文阅读版；命令、路径、API 名称保持英文。

> pi 可以创建 TUI 组件。让它按你的场景构建一个即可。

# TUI 组件 {#tui-components}

扩展和自定义工具可以渲染自定义 TUI 组件，用于交互式用户界面。本页介绍组件系统以及可用的构建块。

**源码：** [`@earendil-works/pi-tui`](https://github.com/earendil-works/pi-mono/tree/main/packages/tui)

## 组件接口 {#component-interface}

所有组件都实现：

```typescript
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  handleMouse?(event: TuiMouseEvent): TuiMouseEventResult | undefined;
  wantsKeyRelease?: boolean;
  invalidate(): void;
}
```

| 方法 | 说明 |
|--------|-------------|
| `render(width)` | 返回字符串数组（每行一个）。每行**不得超过 `width`**。 |
| `handleInput?(data)` | 组件拥有焦点时接收键盘输入。 |
| `handleMouse?(event)` | 在全屏模式下接收规范化的指针输入。 |
| `wantsKeyRelease?` | 为 true 时，组件会接收按键释放事件（Kitty 协议）。默认：false。 |
| `invalidate()` | 清除缓存的渲染状态。主题变更时调用。 |

TUI 会在每行渲染末尾追加完整的 SGR reset 和 OSC 8 reset。样式不会跨行延续。如果你发出带样式的多行文本，请逐行重新应用样式，或使用 `wrapTextWithAnsi()`，以便每行换行后仍保留样式。

## Focusable 接口（IME 支持） {#focusable-interface-ime-support}

需要显示文本光标并支持 IME（输入法编辑器）的组件应实现 `Focusable` 接口：

```typescript
import { CURSOR_MARKER, type Component, type Focusable } from "@earendil-works/pi-tui";

class MyInput implements Component, Focusable {
  focused: boolean = false;  // 焦点变化时由 TUI 设置
  
  render(width: number): string[] {
    const marker = this.focused ? CURSOR_MARKER : "";
    // 在伪光标正前方发出 marker
    return [`> ${beforeCursor}${marker}\x1b[7m${atCursor}\x1b[27m${afterCursor}`];
  }
}
```

当 `Focusable` 组件拥有焦点时，TUI 会：
1. 在组件上设置 `focused = true`
2. 扫描渲染输出中的 `CURSOR_MARKER`（零宽度 APC 转义序列）
3. 将硬件终端光标定位到该位置
4. 仅在启用 `showHardwareCursor` 时显示硬件光标

光标默认保持隐藏。这样可以继续使用伪光标渲染，同时仍为那些在光标隐藏时跟踪 IME 候选窗口的终端定位硬件光标。有些终端需要可见的硬件光标才能定位 IME；可通过渲染器的 `showHardwareCursor` 构造参数或 `setShowHardwareCursor(true)` 启用。Pi 在创建渲染器之前也会把 `PI_HARDWARE_CURSOR=1` 映射到该设置。内置的 `Editor` 和 `Input` 组件已经实现了该接口。

### 含嵌入式输入的容器组件 {#container-components-with-embedded-inputs}

当容器组件（对话框、选择器等）包含 `Input` 或 `Editor` 子组件时，容器必须实现 `Focusable`，并将焦点状态传播给子组件。否则，硬件光标无法为 IME 输入正确定位。

```typescript
import { Container, type Focusable, Input } from "@earendil-works/pi-tui";

class SearchDialog extends Container implements Focusable {
  private searchInput: Input;

  // Focusable 实现 - 传播给子输入以定位 IME 光标
  private _focused = false;
  get focused(): boolean {
    return this._focused;
  }
  set focused(value: boolean) {
    this._focused = value;
    this.searchInput.focused = value;
  }

  constructor() {
    super();
    this.searchInput = new Input();
    this.addChild(this.searchInput);
  }
}
```

如果没有这种传播，使用 IME（中文、日文、韩文等）输入时，候选窗口会显示在屏幕上的错误位置。

## 使用组件 {#using-components}

**在扩展中**通过 `ctx.ui.custom()`：

```typescript
pi.on("session_start", async (_event, ctx) => {
  const result = await ctx.ui.custom<string | null>((tui, theme, keybindings, done) =>
    new MyComponent({
      theme,
      keybindings,
      onChange: () => tui.requestRender(),
      onSelect: (value) => done(value),
      onCancel: () => done(null),
    })
  );
});
```

**在自定义工具中**通过 `ctx.ui.custom()`：

```typescript
async execute(toolCallId, params, signal, onUpdate, ctx) {
  const result = await ctx.ui.custom<string | null>((tui, theme, keybindings, done) =>
    new MyComponent({
      theme,
      keybindings,
      onChange: () => tui.requestRender(),
      onSelect: (value) => done(value),
      onCancel: () => done(null),
    })
  );
  // 使用 result...
}
```

## 覆盖层 {#overlays}

覆盖层会在现有内容之上渲染组件，而不会清屏。向 `ctx.ui.custom()` 传入 `{ overlay: true }`：

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyDialog({ onClose: done }),
  { overlay: true }
);
```

要控制位置和尺寸，使用 `overlayOptions`：

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new SidePanel({ onClose: done }),
  {
    overlay: true,
    overlayOptions: {
      // 尺寸：数字或百分比字符串
      width: "50%",          // 终端宽度的 50%
      minWidth: 40,          // 最少 40 列
      maxHeight: "80%",      // 最多终端高度的 80%

      // 位置：基于锚点（默认："center"）
      anchor: "right-center", // 9 个位置：center、top-left、top-center 等
      offsetX: -2,            // 相对锚点的偏移
      offsetY: 0,

      // 或百分比/绝对定位
      row: "25%",            // 距顶部 25%
      col: 10,               // 第 10 列

      // 边距
      margin: 2,             // 四边，或 { top, right, bottom, left }

      // 响应式：在窄终端上隐藏
      visible: (termWidth, termHeight) => termWidth >= 80,
    },
    // 获取用于编程控制焦点和可见性的 handle
    onHandle: (handle) => {
      // handle.focus() - 聚焦此覆盖层并将其置于视觉最前
      // handle.unfocus() - 将输入交还给正常回退目标
      // handle.unfocus({ target }) - 将输入交给指定组件或 null
      // handle.setHidden(true/false) - 切换可见性
      // handle.hide() - 永久移除
    },
  }
);
```

### 覆盖层焦点 {#overlay-focus}

已聚焦且可见的覆盖层会在临时的非覆盖层 UI 期间保持输入所有权。如果覆盖层打开另一个没有 `{ overlay: true }` 的 `ctx.ui.custom()` 组件，该替换 UI 在活动期间会接收输入；关闭后，已聚焦的覆盖层可以重新收回输入。

当可见覆盖层应停止拥有输入、让 TUI 回退到另一个可见的捕获覆盖层或先前的焦点目标时，使用 `handle.unfocus()`。当覆盖层保持可见、但某个特定组件应接收输入时，使用 `handle.unfocus({ target })`。传入 `{ target: null }` 会有意让焦点为空，直到再次设置焦点。

### 覆盖层生命周期 {#overlay-lifecycle}

覆盖层组件在关闭时会被销毁。不要复用引用——请创建新实例：

```typescript
// 错误 - 过期引用
let menu: MenuComponent;
await ctx.ui.custom((_, __, ___, done) => {
  menu = new MenuComponent(done);
  return menu;
}, { overlay: true });
setActiveComponent(menu);  // 已销毁

// 正确 - 再次调用以重新显示
const showMenu = () => ctx.ui.custom((_, __, ___, done) => 
  new MenuComponent(done), { overlay: true });

await showMenu();  // 第一次显示
await showMenu();  // “返回” = 再调用一次
```

完整示例见 [overlay-qa-tests.ts](../examples/extensions/overlay-qa-tests.ts)，涵盖锚点、边距、堆叠、响应式可见性和动画。

## 内置组件 {#built-in-components}

从 `@earendil-works/pi-tui` 导入：

```typescript
import { Text, Box, Container, Spacer, Markdown } from "@earendil-works/pi-tui";
```

### Text {#text}

带自动换行的多行文本。

```typescript
const text = new Text(
  "Hello World",    // content
  1,                // paddingX（默认：1）
  1,                // paddingY（默认：1）
  (s) => bgGray(s)  // 可选背景函数
);
text.setText("Updated");
```

### Box {#box}

带内边距和背景色的容器。

```typescript
const box = new Box(
  1,                // paddingX
  1,                // paddingY
  (s) => bgGray(s)  // 背景函数
);
box.addChild(new Text("Content", 0, 0));
box.setBgFn((s) => bgBlue(s));
```

### Container {#container}

垂直组合子组件。

```typescript
const container = new Container();
container.addChild(component1);
container.addChild(component2);
container.removeChild(component1);
```

### Spacer {#spacer}

空白垂直间距。

```typescript
const spacer = new Spacer(2);  // 2 行空行
```

### Markdown {#markdown}

渲染带语法高亮的 markdown。

```typescript
const md = new Markdown(
  "# Title\n\nSome **bold** text",
  1,        // paddingX
  1,        // paddingY
  theme     // MarkdownTheme（见下文）
);
md.setText("Updated markdown");
```

### Image {#image}

在受支持的终端中渲染图片（Kitty、iTerm2、Ghostty、WezTerm、Warp）。

```typescript
const image = new Image(
  base64Data,   // base64 编码的图片
  "image/png",  // MIME 类型
  theme,        // ImageTheme
  { maxWidthCells: 80, maxHeightCells: 24 }
);
```

## 键盘输入 {#keyboard-input}

使用 `matchesKey()` 检测按键：

```typescript
import { matchesKey, Key } from "@earendil-works/pi-tui";

handleInput(data: string) {
  if (matchesKey(data, Key.up)) {
    this.selectedIndex--;
  } else if (matchesKey(data, Key.enter)) {
    this.onSelect?.(this.selectedIndex);
  } else if (matchesKey(data, Key.escape)) {
    this.onCancel?.();
  } else if (matchesKey(data, Key.ctrl("c"))) {
    // Ctrl+C
  }
}
```

**按键标识符**（使用 `Key.*` 以获得自动补全，或使用字符串字面量）：
- 基本按键：`Key.enter`、`Key.escape`、`Key.tab`、`Key.space`、`Key.backspace`、`Key.delete`、`Key.home`、`Key.end`
- 方向键：`Key.up`、`Key.down`、`Key.left`、`Key.right`
- 带修饰键：`Key.ctrl("c")`、`Key.shift("tab")`、`Key.alt("left")`、`Key.ctrlShift("p")`
- 字符串格式同样可用：`"enter"`、`"ctrl+c"`、`"shift+tab"`、`"ctrl+shift+p"`

## 鼠标输入 {#mouse-input}

全屏模式会把规范化的按下、释放、点击、移动、拖动和滚轮事件路由到组件和覆盖层。返回 `{ handled: true }` 可抑制默认行为，`capture: true` 可保留拖动/释放所有权，`focus: true` 可请求键盘焦点，当悬停或释放会可见地改变组件时返回 `render: true`。按下、点击、拖动和滚轮默认会触发渲染；无操作的移动/释放事件不会。

```typescript
import { MouseRegion } from "@earendil-works/pi-tui";

const clickable = new MouseRegion(content, (event) => {
  if (event.type !== "click" || event.button !== "left") return undefined;
  expanded = !expanded;
  return { handled: true };
});
```

未处理的滚轮输入会滚动最近的 `ScrollView`；未处理的主键拖动会保留 transcript 选择。OSC 8 链接优先于父级点击区域。`Input`、`Editor`、`SelectList` 和 `SettingsList` 包含全屏鼠标行为。常规模式不捕获鼠标输入，因为终端拥有自己的回滚缓冲区。

## 行宽 {#line-width}

**关键：** `render()` 返回的每一行都不得超过 `width` 参数。

```typescript
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";

render(width: number): string[] {
  // 截断过长的行
  return [truncateToWidth(this.text, width)];
}
```

工具函数：
- `visibleWidth(str)` - 获取显示宽度（忽略 ANSI 码）
- `truncateToWidth(str, width, ellipsis?)` - 截断，可选省略号
- `wrapTextWithAnsi(str, width)` - 保留 ANSI 码的自动换行

## 创建自定义组件 {#creating-custom-components}

示例：交互式选择器

```typescript
import {
  matchesKey, Key,
  truncateToWidth, visibleWidth
} from "@earendil-works/pi-tui";

class MySelector {
  private items: string[];
  private selected = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];
  
  public onSelect?: (item: string) => void;
  public onCancel?: () => void;

  constructor(items: string[]) {
    this.items = items;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) && this.selected > 0) {
      this.selected--;
      this.invalidate();
    } else if (matchesKey(data, Key.down) && this.selected < this.items.length - 1) {
      this.selected++;
      this.invalidate();
    } else if (matchesKey(data, Key.enter)) {
      this.onSelect?.(this.items[this.selected]);
    } else if (matchesKey(data, Key.escape)) {
      this.onCancel?.();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    this.cachedLines = this.items.map((item, i) => {
      const prefix = i === this.selected ? "> " : "  ";
      return truncateToWidth(prefix + item, width);
    });
    this.cachedWidth = width;
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
```

在扩展中的用法：

```typescript
pi.registerCommand("pick", {
  description: "Pick an item",
  handler: async (_args, ctx) => {
    const items = ["Option A", "Option B", "Option C"];
    const selected = await ctx.ui.custom<string | null>((tui, _theme, _keybindings, done) => {
      const selector = new MySelector(items);
      selector.onSelect = done;
      selector.onCancel = () => done(null);

      return {
        render: (width) => selector.render(width),
        handleInput: (data) => {
          selector.handleInput(data);
          tui.requestRender();
        },
        invalidate: () => selector.invalidate(),
      };
    });

    if (selected !== null) {
      ctx.ui.notify(`Selected: ${selected}`, "info");
    }
  }
});
```

## 主题 {#theming}

组件接受主题对象以进行样式设置。

**在 `renderCall`/`renderResult` 中**，使用 `theme` 参数：

```typescript
renderResult(result, options, theme, context) {
  // 使用 theme.fg() 设置前景色
  return new Text(theme.fg("success", "Done!"), 0, 0);
  
  // 使用 theme.bg() 设置背景色
  const styled = theme.bg("toolPendingBg", theme.fg("accent", "text"));
}
```

**前景色**（`theme.fg(color, text)`）：

| 类别 | 颜色 |
|----------|--------|
| 常规 | `text`、`accent`、`muted`、`dim`、`searchMatchText` |
| 状态 | `success`、`error`、`warning` |
| 边框 | `border`、`borderAccent`、`borderMuted` |
| 消息 | `userMessageText`、`customMessageText`、`customMessageLabel` |
| 工具 | `toolTitle`、`toolOutput` |
| Diff | `toolDiffAdded`、`toolDiffRemoved`、`toolDiffContext` |
| Markdown | `mdHeading`、`mdLink`、`mdLinkUrl`、`mdCode`、`mdCodeBlock`、`mdCodeBlockBorder`、`mdQuote`、`mdQuoteBorder`、`mdHr`、`mdListBullet` |
| 语法 | `syntaxComment`、`syntaxKeyword`、`syntaxFunction`、`syntaxVariable`、`syntaxString`、`syntaxNumber`、`syntaxType`、`syntaxOperator`、`syntaxPunctuation` |
| Thinking | `thinkingOff`、`thinkingMinimal`、`thinkingLow`、`thinkingMedium`、`thinkingHigh`、`thinkingXhigh`、`thinkingMax` |
| 模式 | `bashMode` |

**背景色**（`theme.bg(color, text)`）：

`selectedBg`、`searchMatchBg`、`userMessageBg`、`customMessageBg`、`toolPendingBg`、`toolSuccessBg`、`toolErrorBg`

**对于 Markdown**，使用 `getMarkdownTheme()`：

```typescript
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";

renderResult(result, options, theme, context) {
  const mdTheme = getMarkdownTheme();
  return new Markdown(result.details.markdown, 0, 0, mdTheme);
}
```

**对于自定义组件**，定义你自己的主题接口：

```typescript
interface MyTheme {
  selected: (s: string) => string;
  normal: (s: string) => string;
}
```

## 调试日志 {#debug-logging}

设置 `PI_TUI_WRITE_LOG` 以捕获写入 stdout 的原始 ANSI 流。

```bash
PI_TUI_WRITE_LOG=/tmp/tui-ansi.log npx tsx packages/tui/test/chat-simple.ts
```

## 性能 {#performance}

尽可能缓存渲染输出：

```typescript
class CachedComponent {
  private cachedWidth?: number;
  private cachedLines?: string[];

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }
    // ... 计算 lines ...
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
```

状态变化时调用 `invalidate()`，然后使用注入的 `tui.requestRender()` 触发重新渲染。

## 失效与主题变更 {#invalidation-and-theme-changes}

主题变更时，TUI 会在所有组件上调用 `invalidate()` 以清除缓存。组件必须正确实现 `invalidate()`，才能让主题变更生效。

### 问题 {#the-problem}

如果组件预先把主题颜色烘焙进字符串（通过 `theme.fg()`、`theme.bg()` 等）并缓存它们，缓存的字符串会包含旧主题的 ANSI 转义码。如果组件把带主题的内容单独存储，仅清除渲染缓存是不够的。

**错误做法**（主题颜色不会更新）：

```typescript
class BadComponent extends Container {
  private content: Text;

  constructor(message: string, theme: Theme) {
    super();
    // 预先烘焙的主题颜色存储在 Text 组件中
    this.content = new Text(theme.fg("accent", message), 1, 0);
    this.addChild(this.content);
  }
  // 没有 override invalidate - 父类的 invalidate 只清除
  // 子组件的渲染缓存，不会清除预先烘焙的内容
}
```

### 解决方案 {#the-solution}

用主题颜色构建内容的组件必须在调用 `invalidate()` 时重建该内容：

```typescript
class GoodComponent extends Container {
  private message: string;
  private content: Text;

  constructor(message: string) {
    super();
    this.message = message;
    this.content = new Text("", 1, 0);
    this.addChild(this.content);
    this.updateDisplay();
  }

  private updateDisplay(): void {
    // 用当前主题重建内容
    this.content.setText(theme.fg("accent", this.message));
  }

  override invalidate(): void {
    super.invalidate();  // 清除子缓存
    this.updateDisplay(); // 用新主题重建
  }
}
```

### 模式：在 invalidate 时重建 {#pattern-rebuild-on-invalidate}

对于内容复杂的组件：

```typescript
class ComplexComponent extends Container {
  private data: SomeData;

  constructor(data: SomeData) {
    super();
    this.data = data;
    this.rebuild();
  }

  private rebuild(): void {
    this.clear();  // 移除所有子组件

    // 用当前主题构建 UI
    this.addChild(new Text(theme.fg("accent", theme.bold("Title")), 1, 0));
    this.addChild(new Spacer(1));

    for (const item of this.data.items) {
      const color = item.active ? "success" : "muted";
      this.addChild(new Text(theme.fg(color, item.label), 1, 0));
    }
  }

  override invalidate(): void {
    super.invalidate();
    this.rebuild();
  }
}
```

### 何时需要 {#when-this-matters}

需要该模式的情况：

1. **预先烘焙主题颜色** - 使用 `theme.fg()` 或 `theme.bg()` 创建存储在子组件中的带样式字符串
2. **语法高亮** - 使用 `highlightCode()`，它会应用基于主题的语法颜色
3. **复杂布局** - 构建嵌入主题颜色的子组件树

不需要该模式的情况：

1. **使用主题回调** - 传入在渲染期间调用的函数，例如 `(text) => theme.fg("accent", text)`
2. **简单容器** - 只是分组其他组件，不添加带主题的内容
3. **无状态渲染** - 每次 `render()` 都重新计算带主题的输出（不缓存）

## 常见模式 {#common-patterns}

这些模式覆盖了扩展中最常见的 UI 需求。**请复制这些模式，而不是从零构建。**

### 模式 1：选择对话框（SelectList） {#pattern-1-selection-dialog-selectlist}

用于让用户从选项列表中挑选。使用 `@earendil-works/pi-tui` 中的 `SelectList`，并用 `DynamicBorder` 做边框。

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";

pi.registerCommand("pick", {
  handler: async (_args, ctx) => {
    const items: SelectItem[] = [
      { value: "opt1", label: "Option 1", description: "First option" },
      { value: "opt2", label: "Option 2", description: "Second option" },
      { value: "opt3", label: "Option 3" },  // description 是可选的
    ];

    const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const container = new Container();

      // 顶边框
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      // 标题
      container.addChild(new Text(theme.fg("accent", theme.bold("Pick an Option")), 1, 0));

      // 带主题的 SelectList
      const selectList = new SelectList(items, Math.min(items.length, 10), {
        selectedPrefix: (t) => theme.fg("accent", t),
        selectedText: (t) => theme.fg("accent", t),
        description: (t) => theme.fg("muted", t),
        scrollInfo: (t) => theme.fg("dim", t),
        noMatch: (t) => theme.fg("warning", t),
      });
      selectList.onSelect = (item) => done(item.value);
      selectList.onCancel = () => done(null);
      container.addChild(selectList);

      // 帮助文本
      container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));

      // 底边框
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      return {
        render: (w) => container.render(w),
        invalidate: () => container.invalidate(),
        handleInput: (data) => { selectList.handleInput(data); tui.requestRender(); },
      };
    });

    if (result) {
      ctx.ui.notify(`Selected: ${result}`, "info");
    }
  },
});
```

**示例：** [preset.ts](../examples/extensions/preset.ts)、[tools.ts](../examples/extensions/tools.ts)

### 模式 2：可取消的异步操作（BorderedLoader） {#pattern-2-async-operation-with-cancel-borderedloader}

用于耗时且应可取消的操作。`BorderedLoader` 会显示 spinner，并处理 escape 取消。

```typescript
import { BorderedLoader } from "@earendil-works/pi-coding-agent";

pi.registerCommand("fetch", {
  handler: async (_args, ctx) => {
    const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const loader = new BorderedLoader(tui, theme, "Fetching data...");
      loader.onAbort = () => done(null);

      // 执行异步工作
      fetchData(loader.signal)
        .then((data) => done(data))
        .catch(() => done(null));

      return loader;
    });

    if (result === null) {
      ctx.ui.notify("Cancelled", "info");
    } else {
      ctx.ui.setEditorText(result);
    }
  },
});
```

**示例：** [qna.ts](../examples/extensions/qna.ts)、[handoff.ts](../examples/extensions/handoff.ts)

### 模式 3：设置/开关（SettingsList） {#pattern-3-settingstoggles-settingslist}

用于切换多项设置。使用 `@earendil-works/pi-tui` 中的 `SettingsList` 以及 `getSettingsListTheme()`。

```typescript
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";

pi.registerCommand("settings", {
  handler: async (_args, ctx) => {
    const items: SettingItem[] = [
      { id: "verbose", label: "Verbose mode", currentValue: "off", values: ["on", "off"] },
      { id: "color", label: "Color output", currentValue: "on", values: ["on", "off"] },
    ];

    await ctx.ui.custom((_tui, theme, _kb, done) => {
      const container = new Container();
      container.addChild(new Text(theme.fg("accent", theme.bold("Settings")), 1, 1));

      const settingsList = new SettingsList(
        items,
        Math.min(items.length + 2, 15),
        getSettingsListTheme(),
        (id, newValue) => {
          // 处理值变更
          ctx.ui.notify(`${id} = ${newValue}`, "info");
        },
        () => done(undefined),  // 关闭时
        { enableSearch: true }, // 可选：按 label 启用模糊搜索
      );
      container.addChild(settingsList);

      return {
        render: (w) => container.render(w),
        invalidate: () => container.invalidate(),
        handleInput: (data) => settingsList.handleInput?.(data),
      };
    });
  },
});
```

**示例：** [tools.ts](../examples/extensions/tools.ts)

### 模式 4：持久状态指示器 {#pattern-4-persistent-status-indicator}

在页脚中显示跨渲染持久存在的状态。适合模式指示器。

```typescript
// 设置状态（显示在页脚）
ctx.ui.setStatus("my-ext", ctx.ui.theme.fg("accent", "● active"));

// 清除状态
ctx.ui.setStatus("my-ext", undefined);
```

**示例：** [status-line.ts](../examples/extensions/status-line.ts)、[plan-mode/index.ts](../examples/extensions/plan-mode/index.ts)、[preset.ts](../examples/extensions/preset.ts)

### 模式 4b：工作指示器自定义 {#pattern-4b-working-indicator-customization}

自定义 pi 在流式响应时显示的内联工作指示器。

```typescript
// 静态指示器
ctx.ui.setWorkingIndicator({ frames: [ctx.ui.theme.fg("accent", "●")] });

// 自定义动画指示器
ctx.ui.setWorkingIndicator({
  frames: [
    ctx.ui.theme.fg("dim", "·"),
    ctx.ui.theme.fg("muted", "•"),
    ctx.ui.theme.fg("accent", "●"),
    ctx.ui.theme.fg("muted", "•"),
  ],
  intervalMs: 120,
});

// 完全隐藏指示器
ctx.ui.setWorkingIndicator({ frames: [] });

// 恢复 pi 的默认 spinner
ctx.ui.setWorkingIndicator();
```

这只影响正常流式工作时的指示器。压缩和重试 loader 会保留其内置样式。自定义帧会按原样渲染，因此扩展在需要时必须自行添加颜色。

**示例：** [working-indicator.ts](../examples/extensions/working-indicator.ts)

### 模式 5：编辑器上方/下方的 Widget {#pattern-5-widgets-abovebelow-editor}

在输入编辑器上方或下方显示持久内容。适合待办列表、进度。

```typescript
// 简单字符串数组（默认在编辑器上方）
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"]);

// 渲染在编辑器下方
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"], { placement: "belowEditor" });

// 或使用主题
ctx.ui.setWidget("my-widget", (_tui, theme) => {
  const lines = items.map((item, i) =>
    item.done
      ? theme.fg("success", "✓ ") + theme.fg("muted", item.text)
      : theme.fg("dim", "○ ") + item.text
  );
  return {
    render: () => lines,
    invalidate: () => {},
  };
});

// 清除
ctx.ui.setWidget("my-widget", undefined);
```

**示例：** [plan-mode/index.ts](../examples/extensions/plan-mode/index.ts)

### 模式 6：自定义页脚 {#pattern-6-custom-footer}

替换页脚。`footerData` 会暴露扩展原本无法访问的数据。

```typescript
ctx.ui.setFooter((tui, theme, footerData) => ({
  invalidate() {},
  render(width: number): string[] {
    // footerData.getGitBranch(): string | null
    // footerData.getExtensionStatuses(): ReadonlyMap<string, string>
    return [`${ctx.model?.id} (${footerData.getGitBranch() || "no git"})`];
  },
  dispose: footerData.onBranchChange(() => tui.requestRender()), // 响应式
}));

ctx.ui.setFooter(undefined); // 恢复默认
```

可通过 `ctx.sessionManager.getBranch()` 和 `ctx.model` 获取 token 统计。

**示例：** [custom-footer.ts](../examples/extensions/custom-footer.ts)

### 模式 7：自定义编辑器（vim 模式等） {#pattern-7-custom-editor-vim-mode-etc}

用自定义实现替换主输入编辑器。适用于模态编辑（vim）、不同按键绑定（emacs）或专用输入处理。

```typescript
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

type Mode = "normal" | "insert";

class VimEditor extends CustomEditor {
  private mode: Mode = "insert";

  handleInput(data: string): void {
    // Escape：切换到 normal 模式，或交给应用处理
    if (matchesKey(data, "escape")) {
      if (this.mode === "insert") {
        this.mode = "normal";
        return;
      }
      // 在 normal 模式下，escape 会中止 agent（由 CustomEditor 处理）
      super.handleInput(data);
      return;
    }

    // Insert 模式：全部交给 CustomEditor
    if (this.mode === "insert") {
      super.handleInput(data);
      return;
    }

    // Normal 模式：vim 风格导航
    switch (data) {
      case "i": this.mode = "insert"; return;
      case "h": super.handleInput("\x1b[D"); return; // 左
      case "j": super.handleInput("\x1b[B"); return; // 下
      case "k": super.handleInput("\x1b[A"); return; // 上
      case "l": super.handleInput("\x1b[C"); return; // 右
    }
    // 未处理的按键交给 super（ctrl+c 等），但过滤可打印字符
    if (data.length === 1 && data.charCodeAt(0) >= 32) return;
    super.handleInput(data);
  }

  render(width: number): string[] {
    const lines = super.render(width);
    // 在底边框添加模式指示器（使用 truncateToWidth 进行 ANSI 安全截断）
    if (lines.length > 0) {
      const label = this.mode === "normal" ? " NORMAL " : " INSERT ";
      const lastLine = lines[lines.length - 1]!;
      // 传入 "" 作为 ellipsis，避免截断时添加 "..."
      lines[lines.length - 1] = truncateToWidth(lastLine, width - label.length, "") + label;
    }
    return lines;
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    // 工厂函数会从应用接收 TUI、theme 和 keybindings
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new VimEditor(tui, theme, keybindings)
    );
  });
}
```

**要点：**

- **扩展 `CustomEditor`**（而不是基础 `Editor`），以获得应用按键绑定（escape 中止、ctrl+d 退出、模型切换等）
- **对未处理的按键调用 `super.handleInput(data)`**
- **工作状态**：自定义编辑器默认保留独立的工作行。将 `{ embedWorkingStatus: true }` 作为 `CustomEditor` 的第四个构造参数传入，可改用内置的编辑器边框 spinner。
- **工厂模式**：`setEditorComponent` 接收一个工厂函数，该函数会得到 `tui`、`theme` 和 `keybindings`
- **传入 `undefined`** 可恢复默认编辑器：`ctx.ui.setEditorComponent(undefined)`

**示例：** [modal-editor.ts](../examples/extensions/modal-editor.ts)

## 关键规则 {#key-rules}

1. **始终使用回调中的 theme** - 不要直接导入 theme。使用 `ctx.ui.custom((tui, theme, keybindings, done) => ...)` 回调中的 `theme`。

2. **始终为 DynamicBorder 的颜色参数标注类型** - 写成 `(s: string) => theme.fg("accent", s)`，而不是 `(s) => theme.fg("accent", s)`。

3. **状态变化后调用 tui.requestRender()** - 在 `handleInput` 中更新状态后调用 `tui.requestRender()`。

4. **返回三方法对象** - 自定义组件需要 `{ render, invalidate, handleInput }`。

5. **使用现有组件** - `SelectList`、`SettingsList`、`BorderedLoader` 覆盖了 90% 的场景。不要重新实现它们。

## 示例 {#examples}

- **选择 UI**：[examples/extensions/preset.ts](../examples/extensions/preset.ts) - 带 DynamicBorder 边框的 SelectList
- **可取消的异步操作**：[examples/extensions/qna.ts](../examples/extensions/qna.ts) - 用于 LLM 调用的 BorderedLoader
- **设置开关**：[examples/extensions/tools.ts](../examples/extensions/tools.ts) - 用于启用/禁用工具的 SettingsList
- **状态指示器**：[examples/extensions/plan-mode/index.ts](../examples/extensions/plan-mode/index.ts) - setStatus 和 setWidget
- **工作指示器**：[examples/extensions/working-indicator.ts](../examples/extensions/working-indicator.ts) - setWorkingIndicator
- **自定义页脚**：[examples/extensions/custom-footer.ts](../examples/extensions/custom-footer.ts) - 带统计的 setFooter
- **自定义编辑器**：[examples/extensions/modal-editor.ts](../examples/extensions/modal-editor.ts) - 类似 Vim 的模态编辑
- **贪吃蛇游戏**：[examples/extensions/snake.ts](../examples/extensions/snake.ts) - 带键盘输入和游戏循环的完整游戏
- **自定义工具渲染**：[examples/extensions/todo.ts](../examples/extensions/todo.ts) - renderCall 和 renderResult
