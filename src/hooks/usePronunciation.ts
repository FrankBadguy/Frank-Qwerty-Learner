import { pronunciationConfigAtom } from '@/store'
import type { PronunciationType } from '@/typings'
import { addHowlListener } from '@/utils'
import { romajiToHiragana } from '@/utils/kana'
import noop from '@/utils/noop'
import type { Howl } from 'howler'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSound from 'use-sound'
import type { HookOptions } from 'use-sound/dist/types'

const pronunciationApi = 'https://dict.youdao.com/dictvoice?audio='
export function generateWordSoundSrc(word: string, pronunciation: Exclude<PronunciationType, false>) {
  switch (pronunciation) {
    case 'uk':
      return `${pronunciationApi}${word}&type=1`
    case 'us':
      return `${pronunciationApi}${word}&type=2`
    case 'romaji':
      return `${pronunciationApi}${romajiToHiragana(word)}&le=jap`
    case 'zh':
      return `${pronunciationApi}${word}&le=zh`
    case 'ja':
      return `${pronunciationApi}${word}&le=jap`
    case 'de':
      return `${pronunciationApi}${word}&le=de`
    default:
      return `${pronunciationApi}${word}&type=2`
  }
}

export default function usePronunciationSound(word: string, isLoop?: boolean, onEnd?: () => void) {
  const pronunciationConfig = useAtomValue(pronunciationConfigAtom)
  const loop = useMemo(() => (typeof isLoop === 'boolean' ? isLoop : pronunciationConfig.isLoop), [isLoop, pronunciationConfig.isLoop])
  const [isPlaying, setIsPlaying] = useState(false)

  // 最新 onEnd 回调，供 howler end 事件使用，避免闭包过期
  const onEndRef = useRef(onEnd)
  useEffect(() => {
    onEndRef.current = onEnd
  }, [onEnd])

  const url = useMemo(() => generateWordSoundSrc(word, pronunciationConfig.type), [word, pronunciationConfig.type])

  const [play, { stop, sound }] = useSound(url, {
    html5: true,
    format: ['mp3'],
    loop,
    volume: pronunciationConfig.volume,
    rate: pronunciationConfig.rate,
    onloaderror: () => {
      // 加载失败时静默，不降级到语音合成
    },
    onplayerror: () => {
      // 同上：仅标记，不降级
    },
  } as HookOptions)

  // 统一的播放入口：在线音频加载失败时静默（不做语音合成降级）
  const safePlay = useCallback(() => {
    try {
      play()
    } catch {
      // play() 直接抛错时静默
    }
  }, [play])

  useEffect(() => {
    if (!sound) return
    sound.loop(loop)
    return noop
  }, [loop, sound])

  useEffect(() => {
    if (!sound) return
    const unListens: Array<() => void> = []

    unListens.push(addHowlListener(sound, 'play', () => setIsPlaying(true)))
    unListens.push(
      addHowlListener(sound, 'end', () => {
        setIsPlaying(false)
        onEndRef.current?.()
      }),
    )
    unListens.push(addHowlListener(sound, 'pause', () => setIsPlaying(false)))
    unListens.push(
      addHowlListener(sound, 'playerror', () => {
        // 在线音频播放失败时静默，不降级到语音合成
        setIsPlaying(false)
      }),
    )

    return () => {
      setIsPlaying(false)
      unListens.forEach((unListen) => unListen())
      ;(sound as Howl).unload()
    }
  }, [sound])

  return { play: safePlay, stop, isPlaying }
}

export function usePrefetchPronunciationSound(word: string | undefined) {
  const pronunciationConfig = useAtomValue(pronunciationConfigAtom)

  useEffect(() => {
    if (!word) return

    const soundUrl = generateWordSoundSrc(word, pronunciationConfig.type)
    const head = document.head
    const isPrefetch = (Array.from(head.querySelectorAll('link[href]')) as HTMLLinkElement[]).some((el) => el.href === soundUrl)

    if (!isPrefetch) {
      const link = document.createElement('link')
      link.rel = 'prefetch'
      link.href = soundUrl
      // 注意：不设置 crossorigin，保持与 howler html5 模式的加载方式一致
      head.appendChild(link)

      return () => {
        head.removeChild(link)
      }
    }
  }, [pronunciationConfig.type, word])
}
