import type { PronunciationType } from '@/typings'

/**
 * 本地 TTS 代理（vite-plugin-tts-proxy.ts 提供的 /tts 端点）与 Web Speech 兜底工具。
 * 释义朗读走 Edge 神经语音（高质量中文），例句朗读同样经代理按词典语种选音色。
 */

export type TtsVoiceOption = {
  key: string
  name: string
}

/** 释义朗读可选的 Edge 中文音色 */
export const DEFINITION_VOICES: TtsVoiceOption[] = [
  { key: 'zh-CN-XiaoxiaoNeural', name: '晓晓（女·温柔）' },
  { key: 'zh-CN-XiaoyiNeural', name: '晓伊（女·活泼）' },
  { key: 'zh-CN-YunxiNeural', name: '云希（男·青年）' },
  { key: 'zh-CN-YunyangNeural', name: '云扬（男·播音）' },
  { key: 'zh-CN-YunjianNeural', name: '云健（男·浑厚）' },
]

export const DEFAULT_DEFINITION_VOICE = DEFINITION_VOICES[0].key

/** 兼容历史配置里可能存在的非法音色 */
export function definitionVoiceOrDefault(voice: string | undefined): string {
  return voice && DEFINITION_VOICES.some((item) => item.key === voice) ? voice : DEFAULT_DEFINITION_VOICE
}

/** 例句朗读音色：跟随词典发音类型选择对应语种的 Edge 音色 */
export function exampleVoiceFor(type: PronunciationType): string {
  switch (type) {
    case 'uk':
      return 'en-GB-RyanNeural'
    case 'romaji':
    case 'ja':
      return 'ja-JP-KeitaNeural'
    case 'zh':
      return 'zh-CN-YunxiNeural'
    case 'de':
      return 'de-DE-ConradNeural'
    default:
      return 'en-US-GuyNeural'
  }
}

/** 例句 Web Speech 兜底语种（与 exampleVoiceFor 对应） */
export function exampleFallbackLang(type: PronunciationType): string {
  switch (type) {
    case 'uk':
      return 'en-GB'
    case 'romaji':
    case 'ja':
      return 'ja-JP'
    case 'zh':
      return 'zh-CN'
    case 'de':
      return 'de-DE'
    default:
      return 'en-US'
  }
}

/**
 * 构造本地 TTS 代理 URL。语速换算为 SSML 百分比（服务端按此合成，不改音调）。
 * URL 即缓存键（响应 immutable 长缓存），同一文本重复播放不回源。
 */
export function buildEdgeTtsUrl(text: string, voice: string, rate = 1): string {
  if (!text) return ''
  const ratePercent = Math.round((Math.min(Math.max(rate, 0.5), 4) - 1) * 100)
  const params = new URLSearchParams({ text, voice, rate: String(ratePercent) })
  return `${import.meta.env.BASE_URL}tts?${params.toString()}`
}

const POS_ABBREVIATIONS: Record<string, string> = {
  n: '名词',
  v: '动词',
  vt: '及物动词',
  vi: '不及物动词',
  adj: '形容词',
  adv: '副词',
  prep: '介词',
  conj: '连词',
  pron: '代词',
  num: '数词',
  art: '冠词',
  int: '感叹词',
  abbr: '缩写',
  pl: '复数',
  aux: '助动词',
}

/**
 * 清洗释义文本用于朗读：把 "n." "adj." 等词性缩写替换为中文读音，
 * 否则中文音色会逐字母拼读 "n" "adj"，非常生硬。
 */
export function cleanDefinitionForSpeech(trans: string): string {
  const cleaned = trans.replace(/\b(n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|abbr|pl|aux)\.\s*/gi, (_match, abbrev: string) => {
    return `${POS_ABBREVIATIONS[abbrev.toLowerCase()] ?? abbrev}，`
  })
  return cleaned.replace(/^[，,、\s]+/, '').replace(/[，,]{2,}/g, '，')
}

/** Web Speech API 兜底播放。返回是否成功发起（浏览器不支持或无可用语音时返回 false）。 */
export function speakWithWebSpeech(
  text: string,
  options: { lang: string; volume?: number; rate?: number; onEnd?: () => void },
): boolean {
  const synth = window.speechSynthesis
  if (!synth) return false

  try {
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = options.lang
    if (options.volume !== undefined) utterance.volume = options.volume
    if (options.rate !== undefined) utterance.rate = Math.min(Math.max(options.rate, 0.5), 2)

    const langKey = options.lang.replace('_', '-')
    const voices = synth.getVoices()
    const matched =
      voices.find((voice) => voice.lang.replace('_', '-') === langKey) ??
      voices.find((voice) => voice.lang.replace('_', '-').startsWith(langKey.slice(0, 2)))
    if (matched) utterance.voice = matched

    utterance.onend = () => options.onEnd?.()
    utterance.onerror = () => options.onEnd?.()
    synth.speak(utterance)
    return true
  } catch {
    return false
  }
}

let previewAudio: HTMLAudioElement | null = null

/** 设置面板里试听释义音色 */
export function previewTtsVoice(voice: string): void {
  try {
    if (previewAudio) {
      previewAudio.pause()
      previewAudio = null
    }
    const audio = new Audio(buildEdgeTtsUrl('你好，这是释义朗读的音色试听。', voice, 1))
    previewAudio = audio
    void audio.play().catch(() => {})
  } catch {
    // 预览失败静默
  }
}
