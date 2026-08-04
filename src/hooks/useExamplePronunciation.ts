import useEdgeTtsAudio from '@/hooks/useEdgeTtsAudio'
import { pronunciationConfigAtom } from '@/store'
import type { PronunciationType } from '@/typings'
import { exampleFallbackLang, exampleVoiceFor } from '@/utils/tts'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'

/**
 * 例句发音 hook：经本地 TTS 代理用 Edge 神经语音朗读例句（按词典语种选音色），
 * 语速/音量取例句独立配置；代理不可用时回退 Web Speech。
 * Howl 在组件挂载即开始预载例句音频，保证释义（或单词）播完后可立即接上。
 * 空文本时 play 为 no-op。
 */
export default function useExamplePronunciation(text: string) {
  const pronunciationConfig = useAtomValue(pronunciationConfigAtom)

  const voice = useMemo(() => exampleVoiceFor(pronunciationConfig.type), [pronunciationConfig.type])
  const fallbackLang = useMemo(() => exampleFallbackLang(pronunciationConfig.type), [pronunciationConfig.type])

  return useEdgeTtsAudio(text, {
    voice,
    fallbackLang,
    volume: pronunciationConfig.exampleVolume,
    rate: pronunciationConfig.exampleRate,
  })
}
