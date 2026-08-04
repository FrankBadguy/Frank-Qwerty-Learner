import Layout from '../../components/Layout'
import CustomDictPanel from './components/CustomDictPanel'
import FlipPractice from './components/FlipPractice'
import PronunciationSwitcher from './components/PronunciationSwitcher'
import ResultScreen from './components/ResultScreen'
// import Speed from './components/Speed' // 统计面板已隐藏
import StartButton from './components/StartButton'
import Switcher from './components/Switcher'
import WordList from './components/WordList'
import WordPanel from './components/WordPanel'
import { useConfetti } from './hooks/useConfetti'
import { useWordList } from './hooks/useWordList'
import { TypingContext, TypingStateActionType, initialState, typingReducer } from './store'
import Header from '@/components/Header'
// import StarCard from '@/components/StarCard'
import Tooltip from '@/components/Tooltip'
import UpdateDialog from '@/components/UpdateDialog'
import { idDictionaryMap } from '@/resources/dictionary'
import { currentChapterAtom, currentDictIdAtom, currentDictInfoAtom, randomConfigAtom, wordDictationConfigAtom } from '@/store'
// import type { WordWithIndex } from '@/typings'
import { isLegal, safeTrack } from '@/utils'
import { useSaveChapterRecord } from '@/utils/db'
import { useMixPanelChapterLogUploader } from '@/utils/mixpanel'
import { addErrorWordList } from '@/utils/typing-mistake-db'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { NavLink } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useImmerReducer } from 'use-immer'
import IconSwitch2 from '~icons/tabler/switch-2'

const App: React.FC = () => {
  const [state, dispatch] = useImmerReducer(typingReducer, structuredClone(initialState))
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const { words } = useWordList()

  const currentChapter = useAtomValue(currentChapterAtom)
  const [currentDictId, setCurrentDictId] = useAtom(currentDictIdAtom)
  const currentDictInfo = useAtomValue(currentDictInfoAtom)
  const randomConfig = useAtomValue(randomConfigAtom)

  const chapterLogUploader = useMixPanelChapterLogUploader(state)
  const saveChapterRecord = useSaveChapterRecord()

  // 在组件挂载和currentDictId改变时，检查当前字典是否存在，如果不存在，则将其重置为默认值
  useEffect(() => {
    const id = currentDictId
    if (!(id in idDictionaryMap)) {
      setCurrentDictId('cet4')
    }
  }, [currentDictId, setCurrentDictId])

  const skipWord = useCallback(() => {
    dispatch({ type: TypingStateActionType.SKIP_WORD })
  }, [dispatch])

  const setWordDictationConfig = useSetAtom(wordDictationConfigAtom)

  // 顶部栏翻转练习开关：随时进入/退出；章节已完成时则重开本章进入翻转
  const toggleFlipPractice = useCallback(() => {
    if (state.isFinished) {
      setWordDictationConfig((old) => {
        if (old.isOpen && old.openBy === 'auto') {
          return { ...old, isOpen: false }
        }
        return old
      })
      dispatch({ type: TypingStateActionType.REPEAT_CHAPTER, shouldShuffle: randomConfig.isOpen })
      dispatch({ type: TypingStateActionType.SET_IS_FLIP_PRACTICE_MODE, payload: true })
      return
    }
    dispatch({ type: TypingStateActionType.SET_IS_FLIP_PRACTICE_MODE, payload: !state.isFlipPracticeMode })
  }, [dispatch, randomConfig.isOpen, setWordDictationConfig, state.isFinished, state.isFlipPracticeMode])

  useEffect(() => {
    const onBlur = () => {
      dispatch({ type: TypingStateActionType.SET_IS_TYPING, payload: false })
    }
    window.addEventListener('blur', onBlur)

    return () => {
      window.removeEventListener('blur', onBlur)
    }
  }, [dispatch])

  useEffect(() => {
    state.chapterData.words?.length > 0 ? setIsLoading(false) : setIsLoading(true)
  }, [state.chapterData.words])

  useEffect(() => {
    if (!state.isTyping) {
      const onKeyDown = (e: KeyboardEvent) => {
        if (!isLoading && e.key !== 'Enter' && (isLegal(e.key) || e.key === ' ') && !e.altKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          dispatch({ type: TypingStateActionType.SET_IS_TYPING, payload: true })
        }
      }
      window.addEventListener('keydown', onKeyDown)

      return () => window.removeEventListener('keydown', onKeyDown)
    }
  }, [state.isTyping, isLoading, dispatch])

  useEffect(() => {
    if (words !== undefined) {
      dispatch({
        type: TypingStateActionType.SETUP_CHAPTER,
        payload: { words, shouldShuffle: randomConfig.isOpen },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words])

  useHotkeys(
    'alt+s',
    () => {
      if (state.isShowSkip) {
        skipWord()
      }
    },
    { preventDefault: true },
  )

  useEffect(() => {
    // 当用户完成章节后且完成 word Record 数据保存，记录 chapter Record 数据,
    if (state.isFinished && !state.isSavingRecord) {
      chapterLogUploader()
      saveChapterRecord(state)

      const wordList = state.chapterData.wrongWordIndexes.map((index) => state.chapterData.words.find((word) => word.index === index))
      wordList.filter((word) => word !== undefined)

      addErrorWordList(currentDictId, wordList)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isFinished, state.isSavingRecord])

  useEffect(() => {
    // 启动计时器
    let intervalId: number
    if (state.isTyping) {
      intervalId = window.setInterval(() => {
        dispatch({ type: TypingStateActionType.TICK_TIMER })
      }, 1000)
    }
    return () => clearInterval(intervalId)
  }, [state.isTyping, dispatch])

  useHotkeys(
    'alt+s',
    () => {
      if (state.isShowSkip) {
        skipWord()
      }
    },
    { preventDefault: true },
  )

  useHotkeys('alt+f', toggleFlipPractice, { preventDefault: true })

  useHotkeys(
    'alt+m',
    () => {
      dispatch({ type: TypingStateActionType.TOGGLE_IMMERSIVE_MODE })
      safeTrack('ImmersiveMode', { state: state.isImmersiveMode ? 'open' : 'close' })
      if (!state.isImmersiveMode)
        toast('再次按下 Alt + M 可退出沉浸模式🤞', {
          position: 'top-center',
          autoClose: 2000,
          hideProgressBar: true,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: false,
          progress: undefined,
          theme: 'light',
        })
    },
    { preventDefault: true },
  )

  useConfetti(state.isFinished && !state.isImmersiveMode)

  return (
    <>
      <TypingContext.Provider value={{ state: state, dispatch }}>
        {state.isFinished && <ResultScreen />}
        <Layout>
          {!state.isImmersiveMode && (
            <Header>
              <Tooltip content="词典章节切换">
                <NavLink
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ease-in-out sm:text-base ${
                      isActive
                        ? 'brand-gradient text-white shadow-md'
                        : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-indigo-300'
                    }`
                  }
                  to="/gallery"
                >
                  <span className="truncate max-w-[180px] sm:max-w-none">{currentDictInfo.name}</span>
                  <span className="text-xs opacity-75">第 {currentChapter + 1} 章</span>
                </NavLink>
              </Tooltip>
              <PronunciationSwitcher />
              <Switcher />
              <StartButton isLoading={isLoading} />
              <Tooltip content="翻转练习：看英文选中文释义（Alt + F）">
                <button
                  className={`p-[2px] text-lg focus:outline-none ${
                    state.isFlipPracticeMode ? 'text-indigo-500' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  type="button"
                  onClick={(e) => {
                    toggleFlipPractice()
                    e.currentTarget.blur()
                  }}
                  aria-label="翻转练习（Alt + F）"
                >
                  <IconSwitch2 />
                </button>
              </Tooltip>
              <Tooltip content="跳过该词 Alt + S">
                <button
                  className={`${
                    state.isShowSkip ? 'bg-orange-400' : 'invisible w-0 bg-gray-300 px-0 opacity-0'
                  } btn-primary transition-all duration-300 `}
                  onClick={skipWord}
                >
                  Skip
                </button>
              </Tooltip>
            </Header>
          )}
          <div className="container mx-auto flex h-full flex-1 flex-col items-center justify-center pb-4">
            <div className="container relative mx-auto flex h-full w-full flex-col items-center overflow-y-auto px-4">
              <div className="container flex flex-grow items-center justify-center">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center ">
                    <div
                      className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid  border-indigo-400 border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"
                      role="status"
                    ></div>
                  </div>
                ) : (
                  !state.isFinished && (state.isFlipPracticeMode ? <FlipPractice /> : <WordPanel />)
                )}
              </div>
              {/* 统计面板已隐藏，保留底层计时与统计功能 */}
            </div>
          </div>
        </Layout>

        {/* 翻转练习时隐藏单词列表，避免侧栏的中文释义剧透答案 */}
        {!state.isImmersiveMode && !state.isFlipPracticeMode && <WordList />}
        {!state.isImmersiveMode && !state.isFinished && <CustomDictPanel />}
      </TypingContext.Provider>
      <UpdateDialog />
    </>
  )
}

export default App
