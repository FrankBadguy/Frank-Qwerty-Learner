import useEdgeTtsAudio from '@/hooks/useEdgeTtsAudio'
import { pronunciationConfigAtom } from '@/store'
import { cleanDefinitionForSpeech, definitionVoiceOrDefault } from '@/utils/tts'
import { useAtomValue } from 'jotai'
import { useCallback, useMemo, useRef } from 'react'

/**
 * 释义发音 hook：经本地 TTS 代理用 Edge 中文神经语音朗读释义，
 * 音色/音量/倍速取释义独立配置；代理不可用时回退 Web Speech（zh-CN）。
 * 挂载时预载音频，保证单词音播放结束后可无缝接上。
 * 空文本时 play 为 no-op。
 */
export default function useDefinitionPronunciation(text: string, onEnd?: () => void) {
  const pronunciationConfig = useAtomValue(pronunciationConfigAtom)

  // 词性缩写（n. / adj. ...）转中文读音，避免音色逐字母拼读
  const cleaned = useMemo(() => cleanDefinitionForSpeech(text), [text])
  const voice = definitionVoiceOrDefault(pronunciationConfig.transVoice)

  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd
  const handleEnd = useCallback(() => onEndRef.current?.(), [])

  return useEdgeTtsAudio(cleaned, {
    voice,
    fallbackLang: 'zh-CN',
    volume: pronunciationConfig.transVolume,
    rate: pronunciationConfig.transRate,
    onEnd: handleEnd,
  })
}
