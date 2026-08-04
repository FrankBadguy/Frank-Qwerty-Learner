/**
 * 本地 TTS 代理插件（dev server 与 vite preview 均生效）。
 *
 * 背景：微软 Edge "Read Aloud" 神经语音端点校验请求头 User-Agent 必须包含 "Edg/"，
 * 浏览器端 WebSocket 无法自定义该头（Chrome/Safari 会被 403），因此由本地服务端代理合成。
 *
 * 暴露 GET /tts?text=...&voice=...&rate=...&volume=...，返回 audio/mpeg。
 * 音频内容由参数唯一决定，响应带 immutable 长缓存，浏览器侧跨会话复用。
 * 前端不可用（如静态文件直接打开）时由 Web Speech API 兜底。
 */
import { createHash, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const GEC_VERSION = '1-143.0.3650.75'
const WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'

const MAX_TEXT_LENGTH = 800
const SYNTH_TIMEOUT_MS = 15000
const CACHE_MAX_ENTRIES = 500
const RATE_PERCENT_MIN = -50
const RATE_PERCENT_MAX = 300
const VOICE_NAME_PATTERN = /^[A-Za-z0-9-]+$/

type EdgeAudioWs = {
  binaryType: string
  send: (data: string) => void
  close: () => void
  addEventListener: (type: string, listener: (event: { data?: unknown; code?: number }) => void) => void
}

type WebSocketCtor = new (url: string, options?: { headers?: Record<string, string> }) => EdgeAudioWs

function getWebSocketCtor(): WebSocketCtor | null {
  return ((globalThis as unknown as { WebSocket?: WebSocketCtor }).WebSocket ?? null) as WebSocketCtor | null
}

/** Sec-MS-GEC 防滥用令牌：Windows FILETIME（1601 起、100ns 粒度）向下取整 5 分钟后与令牌拼接做 SHA-256 */
function generateSecMsGec(): string {
  let seconds = Math.floor(Date.now() / 1000) + 11644473600
  seconds -= seconds % 300
  const ticks = BigInt(seconds) * 10000000n
  return createHash('sha256').update(`${ticks}${TRUSTED_CLIENT_TOKEN}`).digest('hex').toUpperCase()
}

function dateToString(): string {
  return new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)')
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 经 Edge Read Aloud 端点合成一段 MP3 */
function synthesize(text: string, voice: string, ratePercent: number, volumePercent: number): Promise<Buffer> {
  const WebSocketCtor = getWebSocketCtor()
  if (!WebSocketCtor) {
    return Promise.reject(new Error('当前 Node 版本不支持原生 WebSocket，无法代理 Edge TTS'))
  }

  return new Promise<Buffer>((resolve, reject) => {
    const url =
      `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&Sec-MS-GEC=${generateSecMsGec()}&Sec-MS-GEC-Version=${GEC_VERSION}` +
      `&ConnectionId=${randomUUID().replaceAll('-', '')}`

    const ws = new WebSocketCtor(url, { headers: { 'User-Agent': EDGE_UA } })
    ws.binaryType = 'arraybuffer'

    const chunks: Uint8Array[] = []
    let settled = false

    const settle = (err: Error | null, audio?: Buffer) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        // 已关闭时 close 可能抛错，忽略
      }
      if (err) reject(err)
      else resolve(audio!)
    }

    const timer = setTimeout(() => settle(new Error('Edge TTS 合成超时')), SYNTH_TIMEOUT_MS)

    ws.addEventListener('open', () => {
      const timestamp = dateToString()
      ws.send(
        `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
                  outputFormat: OUTPUT_FORMAT,
                },
              },
            },
          }) +
          '\r\n',
      )

      const locale = voice.split('-').slice(0, 2).join('-') || 'en-US'
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
        `<voice name='${voice}'>` +
        `<prosody pitch='+0Hz' rate='${ratePercent >= 0 ? '+' : ''}${ratePercent}%' volume='${volumePercent >= 0 ? '+' : ''}${volumePercent}%'>` +
        `${escapeXml(text)}</prosody></voice></speak>`

      ws.send(
        `X-RequestId:${randomUUID().replaceAll('-', '')}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}Z\r\nPath:ssml\r\n\r\n${ssml}`,
      )
    })

    ws.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') {
        if (ev.data.includes('Path:turn.end')) {
          settle(null, Buffer.concat(chunks))
        }
        return
      }
      const buf = ev.data as ArrayBuffer
      if (buf.byteLength < 2) return
      const headerLength = new DataView(buf).getUint16(0)
      if (buf.byteLength <= 2 + headerLength) return
      chunks.push(new Uint8Array(buf, 2 + headerLength))
    })

    ws.addEventListener('close', (ev) => {
      settle(new Error(`Edge TTS 连接被关闭（code: ${ev.code}），常见原因是网络不通或令牌被风控`))
    })

    ws.addEventListener('error', () => {
      settle(new Error('Edge TTS WebSocket 连接失败'))
    })
  })
}

const audioCache = new Map<string, Buffer>()
const inflight = new Map<string, Promise<Buffer>>()

async function getAudio(key: string, text: string, voice: string, ratePercent: number, volumePercent: number): Promise<Buffer> {
  const cached = audioCache.get(key)
  if (cached) return cached

  let pending = inflight.get(key)
  if (!pending) {
    pending = synthesize(text, voice, ratePercent, volumePercent)
      .then((audio) => {
        audioCache.set(key, audio)
        if (audioCache.size > CACHE_MAX_ENTRIES) {
          const oldest = audioCache.keys().next().value
          if (oldest !== undefined) audioCache.delete(oldest)
        }
        return audio
      })
      .finally(() => {
        inflight.delete(key)
      })
    inflight.set(key, pending)
  }
  return pending
}

function handleTtsRequest(req: IncomingMessage, res: ServerResponse): void {
  void (async () => {
    try {
      // 简单的跨站防护：带 Origin 头的请求必须同源（本机 audio 元素、curl 不带 Origin）
      const origin = req.headers.origin
      if (origin) {
        const host = req.headers.host
        try {
          if (host && new URL(origin).host !== host) {
            res.statusCode = 403
            res.end('cross-origin tts request rejected')
            return
          }
        } catch {
          res.statusCode = 403
          res.end('invalid origin')
          return
        }
      }

      const query = new URL(req.url ?? '/', 'http://localhost').searchParams
      const text = (query.get('text') ?? '').slice(0, MAX_TEXT_LENGTH)
      const voice = query.get('voice') ?? DEFAULT_VOICE
      const ratePercent = clamp(Number.parseInt(query.get('rate') ?? '0', 10) || 0, RATE_PERCENT_MIN, RATE_PERCENT_MAX)
      const volumePercent = clamp(Number.parseInt(query.get('volume') ?? '0', 10) || 0, -100, 100)

      if (!text.trim()) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('missing text')
        return
      }
      if (!VOICE_NAME_PATTERN.test(voice)) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('invalid voice')
        return
      }

      const audio = await getAudio(`${voice}|${ratePercent}|${text}`, text, voice, ratePercent, volumePercent)

      res.statusCode = 200
      res.setHeader('Content-Type', 'audio/mpeg')
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.end(audio)
    } catch (err) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(`tts proxy error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })()
}

export function ttsProxyPlugin(): Plugin {
  return {
    name: 'qwerty-learner-tts-proxy',
    configureServer(server) {
      server.middlewares.use('/tts', handleTtsRequest)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/tts', handleTtsRequest)
    },
  }
}
