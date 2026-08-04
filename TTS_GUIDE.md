# 高质量释义 / 例句朗读（本地 TTS 代理）

## 背景

- **释义（中文）朗读**：改用微软 Edge「朗读」神经语音（Web Speech API 的替代，质量更高）。
- **例句朗读**：从 Google TTS 改为 Edge 神经语音。
- **播放顺序**：单词发音 → 中文释义 → 例句，三段可各自独立开关（见发音设置）。

## 为什么需要一个本地代理

微软 Edge 朗读端点 `speech.platform.bing.com` 会校验请求头 `User-Agent` 是否包含 `Edg/`。
浏览器内的 `new WebSocket()` 无法自定义该头（由浏览器真实 UA 决定），
Chrome / Safari 用户会直接收到 `403 Forbidden`，因此必须由本地服务端代理合成。

本地服务本身就是本项目（`vite preview` + launchd 托管），
代理以 **Vite 插件** 形式挂到 dev server 与 preview server 的中间件上，无需额外进程。

## 代理端点

```
GET /tts?text=<URL 编码>&voice=<Edge 音色名>&rate=<倍速百分比整数>&volume=<音量百分比整数>
```

- `voice` 省略时默认 `zh-CN-XiaoxiaoNeural`。
- `rate` 为 SSML 百分比（`+0%` 为原速，`50` 表示 1.5 倍），由 `src/utils/tts.ts` 从 0.5~4 倍速换算。
- 响应 `audio/mpeg`（24kHz 48kbps 单声道 MP3），带 `Cache-Control: immutable` 一年缓存 + 进程内内存缓存。
- 安全：`Origin` 非本机的跨域请求返回 403；`voice` 仅允许 `[A-Za-z0-9-]`。

## 涉及文件

- `vite-plugin-tts-proxy.ts` — Vite 插件（`dev` / `preview` 均注册 `/tts`），内含 Edge TTS WebSocket 协议实现。
- `vite.config.ts` — 引入并注册插件。
- `src/utils/tts.ts` — 音色表、释义文本清洗、前端 URL 构造、Web Speech 兜底、试听。
- `src/hooks/useEdgeTtsAudio.ts` — 通用 Edge TTS 音频 hook（Howl 播放 + 失败时 Web Speech 兜底）。
- `src/hooks/useDefinitionPronunciation.ts` / `src/hooks/useExamplePronunciation.ts` — 释义、例句两个封装。
- `src/store/index.ts` — `pronunciation` 配置新增 `transRate` / `transVoice` / `exampleVolume` / `exampleRate`。
- `src/pages/Typing/components/WordPanel/components/WordSound/index.tsx` — 单词→释义→例句播放链。
- 设置面板 / 顶部发音切换器（`Setting/SoundSetting.tsx`、`PronunciationSwitcher/index.tsx`）— 三路独立开关与参数。

## Edge 语音协议要点（维护时注意）

- 端点：`wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1`
- 鉴权查询参数：`TrustedClientToken` + `Sec-MS-GEC`（FILETIME 取整 5 分钟 + 令牌做 SHA-256）+ `Sec-MS-GEC-Version`。
- 握手请求头必须带 Edge 浏览器 UA（`... Edg/...`），否则 403。
- 帧格式：首帧前 2 字节为二进制头长度，其后 `2 + headerLen` 起为 MP3 音频分片；
  文本帧 `Path:turn.end` 表示结束。
- 令牌与版本号若失效（微软可能更新），Edge TTS 社区（`rany2/edge-tts` 等）会跟进，可对照更新。

## 部署注意

- 服务以 `vite preview` 运行，重启（`./service-manager.sh restart`）即生效新代码与新插件。
- Node 需 ≥ v22（原生 WebSocket），本项目已用 v24。
- 直接双击 `dist/index.html`（无本地服务）时释义/例句会回退到 Web Speech API。
