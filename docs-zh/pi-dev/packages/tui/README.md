本文是 `README.md` 的中文阅读版；命令、路径、API 名称保持英文。

# @earendil-works/pi-tui {#earendil-workspi-tui}

最小化的终端 UI 框架，带差分渲染和同步输出，用于无闪烁的交互式 CLI 应用。

## 特性 {#features}

- **可互换的渲染器**：共享 `TUI` 接口，带主屏幕和备用屏幕实现
- **差分渲染**：只更新变化的行或视口行
- **应用拥有的滚动**：备用屏幕视口支持鼠标、触控板和键盘导航
- **同步输出**：使用 CSI 2026 做原子屏幕更新（无闪烁）
- **括号粘贴模式**：正确处理大段粘贴，对超过 10 行的粘贴使用标记
- **基于组件**：简单的 Component 接口，带 render() 方法
- **主题支持**：组件接受 theme 接口以实现可定制样式
- **内置组件**：Text、TruncatedText、Input、Editor、Markdown、Loader、SelectList、SettingsList、MouseRegion、Spacer、Image、Box、Container、VStack、HStack、ScrollView
- **行内图片**：在支持 Kitty 或 iTerm2 图形协议的终端中渲染图片
- **自动补全支持**：文件路径和斜杠命令

## 快速开始 {#quick-start}

```typescript
import { type TUI, Text, Editor, ProcessTerminal, TuiMainScreen, matchesKey } from "@earendil-works/pi-tui";

// 创建终端
const terminal = new ProcessTerminal();

// 通过共享 TUI 接口创建默认的主屏幕渲染器
const tui: TUI = new TuiMainScreen(terminal);

// 添加组件
tui.addChild(new Text("Welcome to my app!"));

import { defaultEditorTheme as editorTheme } from './test/test-themes.ts';
const editor = new Editor(tui, editorTheme);
editor.onSubmit = (text) => {
  console.log("Submitted:", text);
  tui.addChild(new Text(`You said: ${text}`));
};
tui.addChild(editor);

// 聚焦编辑器，使其接收键盘输入
tui.setFocus(editor);

// 在 raw 模式下 Ctrl+C 不会发送 SIGINT — 在此拦截以允许退出
tui.addInputListener((data) => {
  if (matchesKey(data, 'ctrl+c')) {
    tui.stop();
    process.exit(0);
  }
});

// 启动
tui.start();
```

## 核心 API {#core-api}

### TUI 接口与渲染器 {#tui-interface-and-renderers}

`TUI` 是组件管理、焦点、覆盖层、输入、生命周期、终端查询和渲染的共享接口。只在构造应用时选择具体渲染器：

- `TuiMainScreen` 渲染到主终端缓冲区，并保留终端回滚。
- `TuiAltScreen` 在备用终端缓冲区中渲染固定高度视口，由应用拥有滚动。停止时，它恢复主缓冲区并打印完整的最终文档。

```typescript
import { type TUI, TuiAltScreen, TuiMainScreen } from "@earendil-works/pi-tui";


const tui: TUI = new TuiMainScreen(terminal);
// 若要改为在备用终端缓冲区中使用应用拥有的视口：
// const tui: TUI = new TuiAltScreen(terminal);

tui.addChild(component);
tui.removeChild(component);
tui.start();
tui.stop();
tui.requestRender(); // 请求重新渲染

// 全局调试按键处理（Shift+Ctrl+D）
tui.onDebug = () => console.log("Debug triggered");
```

### 备用屏幕视口布局 {#alternate-screen-viewport-layouts}

`TuiAltScreen` 可以渲染显式的终端高度布局。`VStack` 和 `HStack` 分配受约束区域，而 `ScrollView` 拥有一个区域的滚动。这些语义有意在 `TuiMainScreen` 上不可用，因为那里由终端拥有回滚。

```typescript
import {
  Container,
  isViewportTUI,
  ScrollView,
  Text,
  VStack,
} from "@earendil-works/pi-tui";

const transcript = new Container();
transcript.addChild(new Text("History"));

const editorAndFooter = new VStack([
  editor,
  new Text("status"),
]);

if (isViewportTUI(tui)) {
  tui.setLayoutRoot(new VStack([
    {
      component: new ScrollView(transcript, {
        follow: "end",
        primary: true,
        overscroll: "chain",
      }),
      basis: 0,
      grow: 1,
      minSize: 1,
    },
    {
      component: editorAndFooter,
      basis: "auto",
      shrink: 1,
      minSize: 1,
    },
  ]));
}
```

Stack 条目支持 `basis`、`grow`、`shrink`、`minSize`、`maxSize`，以及响应式 `visible` 回调。鼠标滚轮输入默认瞄准指针下的 scroll view，未使用的 delta 会链式传递到外层 scroll view。主 scroll view 接收备用屏幕的键盘导航操作，以及不可滚动区域上的滚轮输入。它也可以在 OSC 133 语义 prompt 标记之间跳转，匹配常见的终端 prompt 导航快捷键。按 `Ctrl+Shift+F` 打开或关闭其带边框的搜索面板。面板显示配置的 previous/next 快捷键，并提供可点击的箭头控件；默认情况下，`Enter`/`Ctrl+G` 和 `Shift+Enter`/`Ctrl+Shift+G` 在匹配项之间移动，`Escape` 也会关闭搜索。`TuiAltScreenOptions.searchMatchStyle` 和 `searchCurrentMatchStyle` 自定义匹配高亮，而 `searchNavigationButtonStyle` 为每个箭头按钮设置样式并接收其 hover 状态。`TuiAltScreenOptions.scrollToEndIndicator` 在 `follow: "end"` 的主 scroll view 滚离末尾时，在其最后一行居中渲染可点击标签；点击它会恢复跟随末尾。

布局几何会为每个被请求的帧重建。有状态组件会被保留，其现有的已渲染行缓存仍然有效。直接在这些布局组件上调用 `render(width)` 会产生无界文档，备用模式恢复主屏幕时也会使用它。

### 覆盖层 {#overlays}

覆盖层在现有内容之上渲染组件，而不替换它。适用于对话框、菜单和模态 UI。

```typescript
// 用默认选项显示覆盖层（居中，最多 80 列）
const handle = tui.showOverlay(component);

// 用自定义定位和尺寸显示覆盖层
// 值可以是数字（绝对）或百分比字符串（例如 "50%"）
const handle = tui.showOverlay(component, {
  // 尺寸
  width: 60,              // 以列为单位的固定宽度
  width: "80%",           // 相对终端的百分比宽度
  minWidth: 40,           // 最小宽度下限
  maxHeight: 20,          // 以行为单位的最大高度
  maxHeight: "50%",       // 相对终端的百分比最大高度

  // 基于锚点的定位（默认：'center'）
  anchor: 'bottom-right', // 相对锚点定位
  offsetX: 2,             // 相对锚点的水平偏移
  offsetY: -1,            // 相对锚点的垂直偏移

  // 基于百分比的定位（锚点的替代）
  row: "25%",             // 垂直位置（0%=顶部，100%=底部）
  col: "50%",             // 水平位置（0%=左侧，100%=右侧）

  // 绝对定位（覆盖锚点/百分比）
  row: 5,                 // 精确行位置
  col: 10,                // 精确列位置

  // 相对终端边缘的边距
  margin: 2,              // 所有边
  margin: { top: 1, right: 2, bottom: 1, left: 2 },

  // 响应式可见性
  visible: (termWidth, termHeight) => termWidth >= 100  // 在窄终端上隐藏

  // 焦点行为
  nonCapturing: true       // 显示时不自动聚焦
});

// OverlayHandle 方法
handle.hide();              // 永久移除覆盖层
handle.setHidden(true);     // 临时隐藏（可以再次显示）
handle.setHidden(false);    // 隐藏后再显示
handle.isHidden();          // 检查是否被临时隐藏
handle.focus();             // 聚焦并提到视觉最前
handle.unfocus();           // 把焦点释放给正常回退目标
handle.unfocus({ target: baseComponent }); // 把该覆盖层的焦点释放给特定组件
handle.unfocus({ target: null });   // 释放该覆盖层并使焦点为空
handle.isFocused();         // 检查覆盖层是否拥有焦点
handle.getBounds();         // 获取上次渲染的、相对终端的边界

handle.unfocus();
// 覆盖层失去焦点；TUI 回退到另一个可见的 capturing 覆盖层，或先前的焦点目标。

handle.unfocus({ target: null });
// 覆盖层失去焦点；在再次设置焦点之前，没有组件接收输入。

// 已聚焦且可见的覆盖层会在临时替换 UI 释放焦点后重新夺回键盘输入。
// 如果你希望在覆盖层仍可见时让特定组件接收输入，
// 调用 handle.unfocus({ target: component })。

// 隐藏最顶层覆盖层
tui.hideOverlay();

// 检查是否有任何可见覆盖层处于活动状态
tui.hasOverlay();
```

**锚点值**：`'center'`、`'top-left'`、`'top-right'`、`'bottom-left'`、`'bottom-right'`、`'top-center'`、`'bottom-center'`、`'left-center'`、`'right-center'`

**解析顺序**：
1. 在宽度计算之后把 `minWidth` 作为下限应用
2. 对于位置：绝对 `row`/`col` > 百分比 `row`/`col` > `anchor`
3. `margin` 钳制最终位置以保持在终端边界内
4. `visible` 回调控制覆盖层是否渲染（每帧调用）

### 组件接口 {#component-interface}

所有组件都实现：

```typescript
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  handleMouse?(event: TuiMouseEvent): TuiMouseEventResult | undefined;
  invalidate?(): void;
}
```


| 方法 | 说明 |
|--------|-------------|
| `render(width)` | 返回字符串数组，每行一个。每行**不得超过 `width`**，否则 TUI 会报错。使用 `truncateToWidth()` 或手动换行来确保这一点。 |
| `handleInput?(data)` | 组件拥有焦点并接收键盘输入时调用。`data` 字符串包含原始终端输入（可能包含 ANSI 转义序列）。 |
| `handleMouse?(event)` | 由 `TuiAltScreen` 为瞄准该组件的规范化指针输入调用。 |
| `invalidate?()` | 调用以清除任何缓存的渲染状态。组件应在下一次 `render()` 调用时从头重新渲染。 |

TUI 会在每行渲染末尾追加完整的 SGR reset 和 OSC 8 reset。样式不会跨行延续。如果你发出带样式的多行文本，请逐行重新应用样式，或使用 `wrapTextWithAnsi()`，以便每行换行后仍保留样式。

### 鼠标输入 {#mouse-input}

`TuiAltScreen` 规范化 SGR 鼠标输入，并对组件和覆盖层做命中测试。事件包含组件本地的 `x`/`y`、绝对的 `screenX`/`screenY`、边界、按钮、修饰键、点击次数以及滚轮 delta。`TuiMainScreen` 不捕获鼠标输入，因为终端拥有其回滚。

```typescript
import type { TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";

handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
  if (event.type === "click" && event.button === "left") {
    this.expanded = !this.expanded;
    return { handled: true };
  }
  if (event.type === "press" && event.button === "left") {
    return { handled: true, capture: true, focus: true };
  }
  if (event.type === "drag") {
    this.updateFromPointer(event.x, event.y);
    return { handled: true, render: true };
  }
  return undefined;
}
```

返回 `handled` 会抑制渲染器级回退行为。`capture` 使后续的 drag 和 release 事件路由到同一组件。`focus` 请求键盘焦点。可选的 `render` 标志控制重绘：press、click、drag 和 wheel 默认会渲染；move 和 release 不会。为可见变化的 hover 状态设置 `render: true`，或为已处理的空操作设置 `render: false`。渲染请求会被合并，终端输出仍是差分的。

未处理的手势保留备用屏幕默认行为：滚轮输入滚动最近的 `ScrollView` 并链式传递未使用的 delta，主键拖动选择文本，OSC 8 链接在父级 click handler 之前打开，未处理的右键点击保留配置的粘贴行为。只有在 press/release 完成且没有 drag 时才会发出 click。

使用 `MouseRegion` 添加鼠标行为而不改变组件的渲染：

```typescript
const collapsible = new MouseRegion(content, (event) => {
  if (event.type !== "click" || event.button !== "left") return undefined;
  expanded = !expanded;
  return { handled: true };
});
```

`Container` 和 `Box` 使用上次渲染帧记录的几何把事件路由到嵌套子组件，因此指针移动不会仅为命中测试而重新渲染子组件。显式的 `VStack`、`HStack` 和 `ScrollView` 布局直接使用备用屏幕的布局帧。

### Focusable 接口（IME 支持） {#focusable-interface-ime-support}

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

光标默认保持隐藏。这样可以继续使用伪光标渲染，同时仍为那些在光标隐藏时跟踪 IME 候选窗口的终端定位硬件光标。有些终端需要可见的硬件光标才能定位 IME；可通过渲染器构造函数的 `showHardwareCursor` 参数或 `setShowHardwareCursor(true)` 启用。内置的 `Editor` 和 `Input` 组件已经实现了该接口。

**含嵌入式输入的容器组件：** 当容器组件（对话框、选择器等）包含 `Input` 或 `Editor` 子组件时，容器必须实现 `Focusable`，并将焦点状态传播给子组件：

```typescript
import { Container, type Focusable, Input } from "@earendil-works/pi-tui";

class SearchDialog extends Container implements Focusable {
  private searchInput: Input;

  // 把焦点传播给子输入，以便定位 IME 光标
  private _focused = false;
  get focused(): boolean { return this._focused; }
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

没有这种传播，用 IME（中文、日文、韩文等）输入时，候选窗口会出现在错误位置。

## 内置组件 {#built-in-components}

### Container {#container}

对子组件分组。

```typescript
const container = new Container();
container.addChild(component);
container.removeChild(component);
```

### Box {#box}

为所有子组件应用内边距和背景色的容器。

```typescript
const box = new Box(
  1,                              // paddingX（默认：1）
  1,                              // paddingY（默认：1）
  (text) => chalk.bgGray(text)   // 可选的背景函数
);
box.addChild(new Text("Content"));
box.setBgFn((text) => chalk.bgBlue(text));  // 动态更改背景
```

### Text {#text}

显示带自动换行和内边距的多行文本。

```typescript
const text = new Text(
  "Hello World",                  // 文本内容
  1,                              // paddingX（默认：1）
  1,                              // paddingY（默认：1）
  (text) => chalk.bgGray(text)   // 可选的背景函数
);
text.setText("Updated text");
text.setCustomBgFn((text) => chalk.bgBlue(text));
```

### TruncatedText {#truncatedtext}

截断以适应视口宽度的单行文本。适用于状态行和页头。

```typescript
const truncated = new TruncatedText(
  "This is a very long line that will be truncated...",
  0,  // paddingX（默认：0）
  0   // paddingY（默认：0）
);
```

### Input {#input}

带水平滚动的单行文本输入。

```typescript
const input = new Input();
input.onSubmit = (value) => console.log(value);
input.setValue("initial");
input.getValue();
```

在备用屏幕模式下，点击会定位光标并赋予输入键盘焦点。

**按键绑定：**
- `Enter` - 提交
- `Ctrl+A` / `Ctrl+E` - 行首/行尾
- `Ctrl+W` 或 `Alt+Backspace` - 向后删除单词
- `Ctrl+U` - 删除到行首
- `Ctrl+K` - 删除到行尾
- `Ctrl+Left` / `Ctrl+Right` - 按词导航
- `Alt+Left` / `Alt+Right` - 按词导航
- 方向键、Backspace、Delete 按预期工作

### Editor {#editor}

多行文本编辑器，带自动补全、文件补全、粘贴处理，以及内容超过终端高度时的垂直滚动。

```typescript
interface EditorTheme {
  borderColor: (str: string) => string;
  selectList: SelectListTheme;
}

interface EditorOptions {
  paddingX?: number;  // 水平内边距（默认：0）
}

const editor = new Editor(tui, theme, options?);  // tui 是感知高度滚动所必需的
editor.onSubmit = (text) => console.log(text);
editor.onChange = (text) => console.log("Changed:", text);
editor.disableSubmit = true; // 临时禁用提交
editor.setAutocompleteProvider(provider);
editor.borderColor = (s) => chalk.blue(s); // 动态更改边框
editor.setPaddingX(1); // 动态更新水平内边距
editor.getPaddingX();  // 获取当前内边距
```

**特性：**
- 在备用屏幕模式下点击定位光标，以及可点击的自动补全行
- 带自动换行的多行编辑
- 斜杠命令自动补全（输入 `/`）
- 文件路径自动补全（按 `Tab`）
- 大段粘贴处理（超过 10 行会创建 `[paste #1 +50 lines]` 标记）
- 编辑器上下的水平线
- 伪光标渲染（隐藏真实光标）

**按键绑定：**
- `Enter` - 提交
- `Shift+Enter`、`Ctrl+Enter` 或 `Alt+Enter` - 新行（取决于终端，Alt+Enter 最可靠）
- `Tab` - 自动补全
- `Ctrl+K` - 删除到行尾
- `Ctrl+U` - 删除到行首
- `Ctrl+W` 或 `Alt+Backspace` - 向后删除单词
- `Alt+D` 或 `Alt+Delete` - 向前删除单词
- `Ctrl+A` / `Ctrl+E` - 行首/行尾
- `Ctrl+]` - 向前跳到某个字符（等待下一次按键，然后把光标移到第一次出现处）
- `Ctrl+Alt+]` - 向后跳到某个字符
- 方向键、Backspace、Delete 按预期工作

### Markdown {#markdown}

渲染带语法高亮和主题支持的 markdown。

```typescript
interface MarkdownTheme {
  heading: (text: string) => string;
  link: (text: string) => string;
  linkUrl: (text: string) => string;
  code: (text: string) => string;
  codeBlock: (text: string) => string;
  codeBlockBorder: (text: string) => string;
  quote: (text: string) => string;
  quoteBorder: (text: string) => string;
  hr: (text: string) => string;
  listBullet: (text: string) => string;
  bold: (text: string) => string;
  italic: (text: string) => string;
  strikethrough: (text: string) => string;
  underline: (text: string) => string;
  highlightCode?: (code: string, lang?: string) => string[];
}

interface DefaultTextStyle {
  color?: (text: string) => string;
  bgColor?: (text: string) => string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
}

const md = new Markdown(
  "# Hello\n\nSome **bold** text",
  1,              // paddingX
  1,              // paddingY
  theme,          // MarkdownTheme
  defaultStyle    // 可选的 DefaultTextStyle
);
md.setText("Updated markdown");
```

**特性：**
- 标题、粗体、斜体、代码块、列表、链接、引用
- HTML 标签渲染为纯文本
- 通过 `highlightCode` 可选语法高亮
- 内边距支持
- 渲染缓存以提升性能

### Loader {#loader}

动画加载旋转器。

```typescript
const loader = new Loader(
  tui,                              // 用于渲染更新的 TUI 实例
  (s) => chalk.cyan(s),            // 旋转器颜色函数
  (s) => chalk.gray(s),            // 消息颜色函数
  "Loading..."                      // 消息（默认："Loading..."）
);
loader.start();
loader.setMessage("Still loading...");
loader.stop();
```

### CancellableLoader {#cancellableloader}

扩展 Loader，带 Escape 键处理和用于取消异步操作的 AbortSignal。

```typescript
const loader = new CancellableLoader(
  tui,                              // 用于渲染更新的 TUI 实例
  (s) => chalk.cyan(s),            // 旋转器颜色函数
  (s) => chalk.gray(s),            // 消息颜色函数
  "Working..."                      // 消息
);
loader.onAbort = () => done(null); // 用户按下 Escape 时调用
doAsyncWork(loader.signal).then(done);
```

**属性：**
- `signal: AbortSignal` - 用户按下 Escape 时 aborted
- `aborted: boolean` - loader 是否被 abort
- `onAbort?: () => void` - 用户按下 Escape 时的回调

### SelectList {#selectlist}

带键盘导航的交互式选择列表。

```typescript
interface SelectItem {
  value: string;
  label: string;
  description?: string;
}

interface SelectListTheme {
  selectedPrefix: (text: string) => string;
  selectedText: (text: string) => string;
  description: (text: string) => string;
  scrollInfo: (text: string) => string;
  noMatch: (text: string) => string;
}

const list = new SelectList(
  [
    { value: "opt1", label: "Option 1", description: "First option" },
    { value: "opt2", label: "Option 2", description: "Second option" },
  ],
  5,      // maxVisible
  theme   // SelectListTheme
);

list.onSelect = (item) => console.log("Selected:", item);
list.onCancel = () => console.log("Cancelled");
list.onSelectionChange = (item) => console.log("Highlighted:", item);
list.setFilter("opt"); // 过滤项目
```

**控件：**
- 鼠标移动/滚轮：在备用屏幕模式下高亮行
- 点击：选择一行
- 方向键：导航
- Enter：选择
- Escape：取消

### SettingsList {#settingslist}

带值循环和子菜单的设置面板。

```typescript
interface SettingItem {
  id: string;
  label: string;
  description?: string;
  currentValue: string;
  values?: string[];  // 若提供，Enter/Space 会循环这些值
  submenu?: (currentValue: string, done: (selectedValue?: string) => void) => Component;
}

interface SettingsListTheme {
  label: (text: string, selected: boolean) => string;
  value: (text: string, selected: boolean) => string;
  description: (text: string) => string;
  cursor: string;
  hint: (text: string) => string;
}

const settings = new SettingsList(
  [
    { id: "theme", label: "Theme", currentValue: "dark", values: ["dark", "light"] },
    { id: "model", label: "Model", currentValue: "gpt-4", submenu: (val, done) => modelSelector },
  ],
  10,      // maxVisible
  theme,   // SettingsListTheme
  (id, newValue) => console.log(`${id} changed to ${newValue}`),
  () => console.log("Cancelled")
);
settings.updateValue("theme", "light");
```

**控件：**
- 鼠标移动/滚轮：在备用屏幕模式下高亮行
- 点击：激活一行
- 方向键：导航
- Enter/Space：激活（循环值或打开子菜单）
- Escape：取消

### Spacer {#spacer}

用于垂直间距的空行。

```typescript
const spacer = new Spacer(2); // 2 个空行（默认：1）
```

### Image {#image}

在支持 Kitty 图形协议（Kitty、Ghostty、WezTerm）或 iTerm2 行内图片的终端中行内渲染图片。在不支持的终端上回退为文本占位符。

```typescript
interface ImageTheme {
  fallbackColor: (str: string) => string;
}

interface ImageOptions {
  maxWidthCells?: number;
  maxHeightCells?: number;
  filename?: string;
}

const image = new Image(
  base64Data,       // base64 编码的图片数据
  "image/png",      // MIME 类型
  theme,            // ImageTheme
  options           // 可选的 ImageOptions
);
tui.addChild(image);
```

支持的格式：PNG、JPEG、GIF、WebP。尺寸会从图片头自动解析。

#### 备用屏幕图片兼容性 {#alternate-screen-image-compatibility}

`TuiAltScreen` 在实现 Kitty 图形协议的终端（包括 Kitty 和 Ghostty）中支持行内图片和部分视口裁剪。iTerm2 的行内图片协议不提供在滚动时删除现有 placement 或裁剪其源的操作。为防止陈旧图片残留在重绘内容之上，`TuiAltScreen` 在 iTerm2 中把图片组件渲染为文本占位符。`TuiMainScreen` 继续正常渲染 iTerm2 行内图片。

## 自动补全 {#autocomplete}

### CombinedAutocompleteProvider {#combinedautocompleteprovider}

同时支持斜杠命令和文件路径。

```typescript
import { CombinedAutocompleteProvider } from "@earendil-works/pi-tui";

const provider = new CombinedAutocompleteProvider(
  [
    { name: "help", description: "Show help" },
    { name: "clear", description: "Clear screen" },
    { name: "delete", description: "Delete last message" },
  ],
  process.cwd() // 文件补全的基础路径
);

editor.setAutocompleteProvider(provider);
```

**特性：**
- 输入 `/` 查看斜杠命令
- 按 `Tab` 进行文件路径补全
- 适用于 `~/`、`./`、`../` 以及 `@` 前缀
- 对 `@` 前缀过滤为可附加文件

## 按键检测 {#key-detection}

使用 `matchesKey()` 和 `Key` 辅助函数检测键盘输入（支持 Kitty keyboard protocol）：

```typescript
import { matchesKey, Key } from "@earendil-works/pi-tui";

if (matchesKey(data, Key.ctrl("c"))) {
  process.exit(0);
}

if (matchesKey(data, Key.enter)) {
  submit();
} else if (matchesKey(data, Key.escape)) {
  cancel();
} else if (matchesKey(data, Key.up)) {
  moveUp();
}
```

**按键标识符**（使用 `Key.*` 以获得自动补全，或使用字符串字面量）：
- 基本键：`Key.enter`、`Key.escape`、`Key.tab`、`Key.space`、`Key.backspace`、`Key.delete`、`Key.home`、`Key.end`
- 方向键：`Key.up`、`Key.down`、`Key.left`、`Key.right`
- 带修饰键：`Key.ctrl("c")`、`Key.shift("tab")`、`Key.alt("left")`、`Key.ctrlShift("p")`
- 字符串格式也可以：`"enter"`、`"ctrl+c"`、`"shift+tab"`、`"ctrl+shift+p"`

## 渲染模式 {#rendering-modes}

`TuiMainScreen` 使用三种渲染策略：

1. **首次渲染**：输出所有行，不清除回滚
2. **宽度变化或视口上方变化**：清屏并完整重新渲染
3. **正常更新**：把光标移到第一行变化处，清除到末尾，并渲染变化的行

`TuiAltScreen` 拥有终端高度的视口。没有显式布局根时，它保留旧的单文档滚动行为。使用 `setLayoutRoot()` 后，`VStack`、`HStack` 和嵌套的 `ScrollView` 组件可以预留固定区域，并独立滚动受约束区域。它就地更新变化的视口行，在底部时跟随流式输出，并在内容增长时保留手动选择的滚动位置。鼠标滚轮和可配置的键盘导航会滚动而不修改终端回滚，包括在 OSC 133 语义 prompt 标记之间跳转。滚动条支持 hover 展开、滑块拖动以及点击轨道跳转。点击 OSC 8 超链接会用配置的 URL handler 打开它。用主键拖动会选择文本，并且除非 `TuiAltScreenOptions.copyOnSelect` 为 `false`，否则会用 OSC 52 复制到剪贴板；把拖动停在 scroll view 的顶部或底部边缘会自动滚动，并把选择扩展到屏幕外内容。Kitty 图片支持垂直视口裁剪；iTerm2 行内图片回退为文本，因为 iTerm2 协议无法在视口重绘期间删除或裁剪 placement。

两种渲染器都把更新包在 **同步输出**（`\x1b[?2026h` ... `\x1b[?2026l`）中，以实现原子、无闪烁渲染。

## 终端接口 {#terminal-interface}

TUI 适用于任何实现 `Terminal` 接口的对象：

```typescript
interface Terminal {
  start(onInput: (data: string) => void, onResize: () => void): void;
  stop(): void;
  write(data: string): void;
  get columns(): number;
  get rows(): number;
  moveBy(lines: number): void;
  hideCursor(): void;
  showCursor(): void;
  clearLine(): void;
  clearFromCursor(): void;
  clearScreen(): void;
}
```

**内置实现：**
- `ProcessTerminal` - 使用 `process.stdin/stdout`
- `VirtualTerminal` - 用于测试（使用 `@xterm/headless`）

## 工具函数 {#utilities}

```typescript
import { visibleWidth, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

// 获取字符串的可见宽度（忽略 ANSI 码）
const width = visibleWidth("\x1b[31mHello\x1b[0m"); // 5

// 截断字符串到指定宽度（保留 ANSI 码，添加省略号）
const truncated = truncateToWidth("Hello World", 8); // "Hello..."

// 不带省略号截断
const truncatedNoEllipsis = truncateToWidth("Hello World", 8, ""); // "Hello Wo"

// 按宽度换行（跨换行保留 ANSI 码）
const lines = wrapTextWithAnsi("This is a long line that needs wrapping", 20);
// ["This is a long line", "that needs wrapping"]
```

## 创建自定义组件 {#creating-custom-components}

创建自定义组件时，**`render()` 返回的每一行都不得超过 `width` 参数**。如果任何行宽于终端，TUI 会报错。

### 处理输入 {#handling-input}

使用 `matchesKey()` 和 `Key` 辅助函数处理键盘输入：

```typescript
import { matchesKey, Key, truncateToWidth } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";

class MyInteractiveComponent implements Component {
  private selectedIndex = 0;
  private items = ["Option 1", "Option 2", "Option 3"];
  
  public onSelect?: (index: number) => void;
  public onCancel?: () => void;

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    } else if (matchesKey(data, Key.down)) {
      this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
    } else if (matchesKey(data, Key.enter)) {
      this.onSelect?.(this.selectedIndex);
    } else if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.onCancel?.();
    }
  }

  render(width: number): string[] {
    return this.items.map((item, i) => {
      const prefix = i === this.selectedIndex ? "> " : "  ";
      return truncateToWidth(prefix + item, width);
    });
  }
}
```

### 处理行宽 {#handling-line-width}

使用提供的工具函数确保行能放下：

```typescript
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";

class MyComponent implements Component {
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  render(width: number): string[] {
    // 选项 1：截断长行
    return [truncateToWidth(this.text, width)];

    // 选项 2：检查并填充到精确宽度
    const line = this.text;
    const visible = visibleWidth(line);
    if (visible > width) {
      return [truncateToWidth(line, width)];
    }
    // 填充到精确宽度（可选，用于背景）
    return [line + " ".repeat(width - visible)];
  }
}
```

### ANSI 码注意事项 {#ansi-code-considerations}

`visibleWidth()` 和 `truncateToWidth()` 都能正确处理 ANSI 转义码：

- `visibleWidth()` 在计算宽度时忽略 ANSI 码
- `truncateToWidth()` 保留 ANSI 码，并在截断时正确关闭它们

```typescript
import chalk from "chalk";

const styled = chalk.red("Hello") + " " + chalk.blue("World");
const width = visibleWidth(styled); // 11（不计 ANSI 码）
const truncated = truncateToWidth(styled, 8); // 红色 "Hello" + " W..."，带正确 reset
```

### 缓存 {#caching}

为了性能，组件应缓存其渲染输出，并且只在必要时重新渲染：

```typescript
class CachedComponent implements Component {
  private text: string;
  private cachedWidth?: number;
  private cachedLines?: string[];

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines = [truncateToWidth(this.text, width)];

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

## 示例 {#example}

完整聊天界面示例见 `test/chat-simple.ts`，包含：
- 带自定义背景色的 Markdown 消息
- 响应期间的加载旋转器
- 带自动补全和斜杠命令的 Editor
- 消息之间的 Spacer

运行它：
```bash
npx tsx test/chat-simple.ts
```

## 开发 {#development}

```bash
# 安装依赖（从 monorepo 根目录）
npm install

# 运行类型检查
npm run check

# 运行 demo
npx tsx test/chat-simple.ts
```

### 调试日志 {#debug-logging}

设置 `PI_TUI_WRITE_LOG` 以捕获写入 stdout 的原始 ANSI 流。

```bash
PI_TUI_WRITE_LOG=/tmp/tui-ansi.log npx tsx test/chat-simple.ts
```
