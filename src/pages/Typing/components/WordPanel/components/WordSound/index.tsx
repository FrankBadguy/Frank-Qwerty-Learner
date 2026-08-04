import type { SoundIconProps } from '../SoundIcon'
import { SoundIcon } from '../SoundIcon'
import styles from './index.module.css'
import Tooltip from '@/components/Tooltip'
import useDefinitionPronunciation from '@/hooks/useDefinitionPronunciation'
import useExamplePronunciation from '@/hooks/useExamplePronunciation'
import usePronunciationSound from '@/hooks/usePronunciation'
import { TypingContext } from '@/pages/Typing/store'
import { pronunciationConfigAtom, pronunciationIsOpenAtom } from '@/store'
import { useAtomValue } from 'jotai'
import { useCallback, useContext, useEffect } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

const WordSound = ({ word, inputWord, transText, exampleText, ...rest }: WordSoundProps) => {
  // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
  const { state } = useContext(TypingContext)!
  const pronunciationConfig = useAtomValue(pronunciationConfigAtom)
  const pronunciationIsOpen = useAtomValue(pronunciationIsOpenAtom)

  const { play: playExample, stop: stopExample, isPlaying: examplePlaying } = useExamplePronunciation(exampleText ?? '')

  const definitionEnabled = pronunciationConfig.isTransRead && !!transText
  const exampleEnabled = pronunciationConfig.isExampleRead && !!exampleText

  // 播放链：单词 → 释义（中文）→ 例句，三段各自受开关控制，前一段结束后接后一段
  // 释义播完回调 handleDefinitionEnd（作为 onEnd 传入释义 hook），继续触发例句
  const handleDefinitionEnd = useCallback(() => {
    if (exampleEnabled) playExample()
  }, [exampleEnabled, playExample])

  const { play: playDefinition, stop: stopDefinition, isPlaying: definitionPlaying } = useDefinitionPronunciation(
    pronunciationConfig.isTransRead ? (transText ?? '') : '',
    handleDefinitionEnd,
  )

  const handleWordEnd = useCallback(() => {
    if (definitionEnabled) playDefinition()
    else handleDefinitionEnd()
  }, [definitionEnabled, playDefinition, handleDefinitionEnd])

  const { play, stop, isPlaying } = usePronunciationSound(word, false, handleWordEnd)

  const stopAll = useCallback(() => {
    stop()
    stopDefinition()
    stopExample()
  }, [stop, stopDefinition, stopExample])

  useHotkeys(
    'ctrl+j',
    () => {
      if (state.isTyping) {
        stopAll()
        play()
      }
    },
    [play, stopAll, state.isTyping],
    { enableOnFormTags: true, preventDefault: true },
  )
  useEffect(() => {
    if (inputWord.length === 0 && state.isTyping) {
      if (!pronunciationConfig.isOpen) {
        // 单词发音关闭时，直接从链的下一段开始
        stopAll()
        handleWordEnd()
      } else {
        stopAll()
        play()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, inputWord, stopAll, state.isTyping, pronunciationConfig.isOpen, handleWordEnd])

  useEffect(() => {
    return () => {
      stopAll()
    }
  }, [word, stopAll])

  const handleClickSoundIcon = useCallback(() => {
    stopAll()
    play()
  }, [play, stopAll])

  return (
    <>
      {pronunciationIsOpen && (
        <Tooltip content="朗读发音（Ctrl + J）" className={`${styles.wordSound}`}>
          <SoundIcon animated={isPlaying || definitionPlaying || examplePlaying} {...rest} onClick={handleClickSoundIcon} />
        </Tooltip>
      )}
    </>
  )
}

export type WordSoundProps = {
  word: string
  inputWord: string
  transText?: string
  exampleText?: string
} & SoundIconProps

export default WordSound
