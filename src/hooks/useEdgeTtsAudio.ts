import { addHowlListener } from '@/utils'
import { buildEdgeTtsUrl, speakWithWebSpeech } from '@/utils/tts'
import type { Howl } from 'howler'
// howler 是 UMD/CJS 包，vite/esbuild 只产出 default 导出，命名导入绑定会是 undefined，
// 需通过 namespace 运行时读取（与 use-sound 内部 mod.Howl ?? mod.default.Howl 的取法一致）
import * as HowlerModule from 'howler'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const HowlConstructor: typeof Howl =
  HowlerModule.Howl ?? (HowlerModule as unknown as { default?: { Howl: typeof Howl } }).default!.Howl

export type UseEdgeTtsAudioOptions = {
  /** Edge 音色名，如 zh-CN-XiaoxiaoNeural */
  voice: string
  /** 播放音量 0..1（Howl 实时调节，不触发重新加载） */
  volume?: number
  /** 语速 0.5..4，换算为 SSML 百分比交给服务端合成（不改音调） */
  rate?: number
  /** 本地代理不可用时的 Web Speech 兜底语种（如 zh-CN）；不传则失败时静默 */
  fallbackLang?: string
  /** 自然播放结束回调（含兜底播放结束）；stop() 不触发 */
  onEnd?: () => void
}

export type UseEdgeTtsAudioResult = {
  play: () => void
  stop: () => void
  isPlaying: boolean
}

/**
 * Edge TTS 音频 hook：挂载/文本变化时预载本地代理合成的 MP3，play() 秒播；
 * 代理加载失败时回退到 Web Speech API（质量较低但保证有声音）。
 * 供释义朗读与例句朗读共用。
 */
export default function useEdgeTtsAudio(text: string, options: UseEdgeTtsAudioOptions): UseEdgeTtsAudioResult {
  const { voice, volume = 1, rate = 1, fallbackLang, onEnd } = options
  const [isPlaying, setIsPlaying] = useState(false)

  const url = useMemo(() => buildEdgeTtsUrl(text, voice, rate), [text, voice, rate])

  // 事件回调里统一读 ref，避免闭包过期
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const fallbackLangRef = useRef(fallbackLang)
  fallbackLangRef.current = fallbackLang
  const textRef = useRef(text)
  textRef.current = text

  const howlRef = useRef<Howl | null>(null)
  const unlistenersRef = useRef<Array<() => void>>([])
  const pendingPlayRef = useRef(false)
  // 兜底播放的代次：stop/重新 play 时自增，使旧兜底 utterance 的结束回调失效
  const fallbackTokenRef = useRef(0)
  const urlRef = useRef(url)
  urlRef.current = url

  const clearListeners = useCallback(() => {
    unlistenersRef.current.forEach((unlisten) => unlisten())
    unlistenersRef.current = []
  }, [])

  const cancelFallback = useCallback(() => {
    fallbackTokenRef.current += 1
    window.speechSynthesis?.cancel()
  }, [])

  /** 代理不可用时用 Web Speech 兜底播放 */
  const playFallback = useCallback(() => {
    const currentText = textRef.current
    if (!currentText || !fallbackLangRef.current) {
      setIsPlaying(false)
      return
    }
    const token = ++fallbackTokenRef.current
    const ok = speakWithWebSpeech(currentText, {
      lang: fallbackLangRef.current,
      volume: volumeRef.current,
      rate,
      onEnd: () => {
        if (fallbackTokenRef.current !== token) return
        setIsPlaying(false)
        onEndRef.current?.()
      },
    })
    setIsPlaying(ok)
    if (!ok) onEndRef.current?.()
  }, [rate])

  const loadCandidate = useCallback(
    (candidateUrl: string) => {
      // 先解绑并卸载旧 Howl，再断开引用，防止旧 Howl 的 onload 迟到触发
      const prev = howlRef.current
      howlRef.current = null
      if (prev) {
        clearListeners()
        prev.unload()
      }
      if (!candidateUrl) return

      const howl: Howl = new HowlConstructor({
        src: [candidateUrl],
        html5: true,
        format: ['mp3'],
        volume: volumeRef.current,
        onload: () => {
          if (howl !== howlRef.current) return
          if (pendingPlayRef.current) {
            pendingPlayRef.current = false
            howl.play()
          }
        },
        onloaderror: () => {
          if (howl !== howlRef.current) return
          if (pendingPlayRef.current) {
            pendingPlayRef.current = false
            playFallback()
          }
        },
        onplayerror: () => {
          if (howl !== howlRef.current) return
          playFallback()
        },
      })

      unlistenersRef.current = [
        addHowlListener(howl, 'play', () => setIsPlaying(true)),
        addHowlListener(howl, 'end', () => {
          setIsPlaying(false)
          onEndRef.current?.()
        }),
        addHowlListener(howl, 'pause', () => setIsPlaying(false)),
        addHowlListener(howl, 'playerror', () => setIsPlaying(false)),
      ]
      howlRef.current = howl
    },
    [clearListeners, playFallback],
  )

  useEffect(() => {
    if (!url) {
      // 文本为空：清掉旧音频即可
      const prev = howlRef.current
      howlRef.current = null
      if (prev) {
        clearListeners()
        prev.unload()
      }
      return
    }
    loadCandidate(url)
    return () => {
      pendingPlayRef.current = false
      setIsPlaying(false)
      cancelFallback()
      clearListeners()
      howlRef.current?.unload()
      howlRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  // 音量实时生效
  useEffect(() => {
    howlRef.current?.volume(volume)
  }, [volume])

  const play = useCallback(() => {
    cancelFallback()
    if (!urlRef.current) {
      onEndRef.current?.()
      return
    }
    const howl = howlRef.current
    if (!howl) return
    if (howl.state() === 'loaded') {
      howl.play()
    } else {
      pendingPlayRef.current = true
      if (howl.state() === 'unloaded') howl.load()
    }
  }, [cancelFallback])

  const stop = useCallback(() => {
    pendingPlayRef.current = false
    cancelFallback()
    howlRef.current?.stop()
    setIsPlaying(false)
  }, [cancelFallback])

  return { play, stop, isPlaying }
}
