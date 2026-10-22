# 故事本格式 v1

当前红雨伞[声音升级版](storybooks/samples/rabbit-red-umbrella-audio-v3.zip)使用兼容旧故事的 [v2 格式](STORYBOOK-FORMAT-V2.md)，加入环境声、延迟对白及事件音量。下文仍是 v1 规范；[声音制作与检查记录](audio-upgrade/README.md)另列。

播放器与内容分开维护。制作新故事只需编辑 `story.json`、替换图片和音频，再压缩为 ZIP；无需修改 HTML、CSS 或播放器脚本。首页选择「导入故事本」，也可把 ZIP 拖入导入区。

示例：[晚安，小星星 · 8 页](storybooks/samples/moon-star.zip)、[小花的早安 · 3 页](storybooks/samples/garden-morning.zip)。第二本没有音频，用于展示纯字幕播放和不同角色、页数。

新制作：[小兔子的红雨伞 · 8 页](storybooks/samples/rabbit-red-umbrella.zip)，含插画、中文合成配音和每页一个点击目标；[查看故事说明与格式适配边界](RED-UMBRELLA.md)。

## 文件结构

```text
my-story.zip
├── story.json
└── assets/
    ├── garden.svg
    ├── flower.svg
    └── narration.wav
```

可以直接压缩这些文件，也可以用一个外层目录包住整本故事。`story.json` 只能有一个，所有资源必须在它所在目录内。JSON 使用 UTF-8。路径区分大小写，使用 `/`，不允许绝对路径、`..`、远程 URL、查询参数或脚本。

## 可直接改写的最小故事

下面配置使用 `assets/garden.svg` 和 `assets/sprout.svg` 两张图片。可从第二本示例复制图片后替换文字；这一页有一个点击目标。

```json
{
  "schemaVersion": 1,
  "id": "my-garden",
  "title": "花园里的一天",
  "subtitle": "点一点，和小花打个招呼",
  "description": "一本可独立导入的示例故事。",
  "goal": "观察与回应",
  "cover": {
    "background": "assets/garden.svg",
    "layers": [
      { "image": "assets/sprout.svg", "x": 50, "y": 68, "width": 35, "aspectRatio": 0.8 }
    ]
  },
  "ending": {
    "title": "下次再见",
    "text": "今天的小花是什么样子的？",
    "image": "assets/sprout.svg"
  },
  "pages": [
    {
      "id": "hello",
      "title": "你好，小花",
      "background": "assets/garden.svg",
      "narration": { "text": "阳光照进花园，小花醒来了。" },
      "actors": [
        {
          "id": "flower",
          "name": "小花",
          "image": "assets/sprout.svg",
          "x": 50,
          "y": 67,
          "width": 20,
          "aspectRatio": 0.8
        }
      ],
      "steps": [
        {
          "target": "flower",
          "hint": "点点小花，和它打招呼",
          "response": { "text": "早上好！", "animation": "bounce" }
        }
      ]
    }
  ]
}
```

## 字段与交互

| 字段 | 规则 |
| --- | --- |
| `schemaVersion` | 必须为数字 `1`。 |
| `id`、页 `id`、角色 `id` | 1–64 个英文字母、数字、`_` 或 `-`。页 ID 全书唯一，角色 ID 在当前页唯一。 |
| `title` | 书名最多 80 字符；页标题最多 80 字符。 |
| `subtitle`、`description`、`goal` | 可省略。分别最多 120 / 600 / 600 字符。 |
| `cover` | 必需；`background` 必需，`layers` 可省略或为 0–6 个图层，`audio` 可省略。 |
| `ending` | 必需；`title` 最多 120 字符，`text` 最多 300 字符，`image` 可省略。 |
| `pages` | 1–100 页，按数组顺序阅读。 |
| 页 `background` | 必需，为包内图片相对路径。背景按容器铺满裁切，主要信息应放在中心区域。 |
| `narration` | 必需；`text` 为 1–600 字符；`audio` 可省略。 |
| `actors` | 每页 1–8 个角色；`name` 为 1–40 字符，用于辅助标签和对白署名；`image` 必需。 |
| `steps` | 每页 1–2 步，严格按数组顺序提示。`target` 必须引用当前页角色 ID，`hint` 为 1–160 字符。 |
| `response` | `text` 为 1–600 字符，`audio` 可省略，`animation` 可省略，默认 `bounce`。 |

角色和封面图层共用定位字段：

| 字段 | 含义 | 范围 / 默认值 |
| --- | --- | --- |
| `x`、`y` | 图层中心位置占场景宽 / 高的百分比 | 0–100；默认 50 / 65 |
| `width` | 图层宽度占场景宽度的百分比 | 5–60；默认 20 |
| `aspectRatio` | 热区宽高比，图片在热区内等比显示 | 0.3–4；默认 0.8 |

建议角色放在场景中部，避免左右翻页箭头、右上角锁和底部字幕；在横屏与竖屏都检查。图片自身的透明留白会影响可见角色大小。

支持的预设动作：`bounce`（弹动）、`lift`（向上抬）、`fly`（飞动）、`drift`（摇动）。故事包不含自定义 JavaScript、HTML 或 CSS，不能改变导航、全屏锁或家长控制。

## 图片、声音与限制

- 图片支持 PNG、JPEG、WebP、GIF 和静态 SVG；透明角色推荐 PNG / WebP / SVG。SVG 不接受脚本、事件、内嵌 HTML、外部引用和动画元素。
- 音频支持 WAV、MP3、OGG、M4A，实际解码能力由浏览器决定。给 `cover.audio`、`narration.audio` 或 `response.audio` 填相对路径即可接入。
- 没有音频时显示字幕并按字数等待，再给出点击提示；有音频但播放失败时提示并回退到字幕。包内提供音频不保证浏览器一定能解码。
- ZIP 最大 64 MiB，解压后总计最大 128 MiB，最多 512 个文件，单文件最大 32 MiB，`story.json` 最大 2 MiB；所引用图片最大 3200 万像素。
- 当前仅保存一本故事。校验和本机写入完成后才替换当前故事；错误包会显示原因并保留原书。
- 内容保存在当前浏览器、当前页面地址所属的 IndexedDB，不上传。刷新或切换原型页面可继续使用。更换浏览器、协议或端口不共享；清理站点数据会清除本机导入内容。

推荐使用本机 HTTP 预览。直接打开 `file:` 时，各浏览器对 Worker 和 IndexedDB 的支持不一致；没有已保存的故事时会提示先导入，不自动请求远程内容。
