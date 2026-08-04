import { TypingContext, TypingStateActionType } from '../../store'
import WordSound from '../WordPanel/components/WordSound'
import useKeySounds from '@/hooks/useKeySounds'
import { currentDictIdAtom, currentDictInfoAtom } from '@/store'
import shuffle from '@/utils/shuffle'
import { useAtomValue } from 'jotai'
import { useHotkeys } from 'react-hotkeys-hook'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getExtraTransPool } from './extraTransPool'
import styles from './index.module.css'

const OPTION_COUNT = 4
// 答对后短暂停留展示绿色反馈，再进入下一个单词
const ADVANCE_DELAY_MS = 350
// 同章节干扰项名额：其余名额由其他词本的释义补足
const CHAPTER_DISTRACTOR_SLOTS = 2

// 词性前缀（n. / v. / adj. 等）
const POS_PREFIX_RE = /^(n|v|vt|vi|adj|adv|prep|conj|pron|art|num|int|aux|pl|abbr)\.\s*/i

// 选项显示用：每个分段去掉开头的词性前缀，再合并回 “A；B” 形式
const cleanTrans = (t: string) =>
  t
    .split(/[；;]/)
    .map((seg) => seg.replace(POS_PREFIX_RE, '').trim())
    .filter((seg) => seg.length > 0)
    .join('；')

// 其他词本干扰项用：只随机截取释义中的一个中文词，让干扰项短小、不易一眼排除
const shortenTrans = (t: string) => {
  const segs = t
    .split(/[；;，,、]/)
    .map((seg) => seg.replace(POS_PREFIX_RE, '').trim())
    .filter((seg) => seg.length >= 2)
  if (segs.length === 0) return cleanTrans(t)
  return segs[Math.floor(Math.random() * segs.length)]
}

// 归一化：去掉词性前缀、空白与标点，用于判断两个释义是否“过于相近”
const normalizeTrans = (t: string) => cleanTrans(t).replace(/[\s，,\.。、（）()\[\]【】\-—…~·]/g, '')

// 相近 = 归一化后相同，或（在较短一方长度 ≥ 2 时）存在包含关系（如“苹果”与“苹果树”）
const isSimilarTrans = (a: string, b: string) => {
  const na = normalizeTrans(a)
  const nb = normalizeTrans(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (Math.min(na.length, nb.length) < 2) return false
  return na.includes(nb) || nb.includes(na)
}

/**
 * 翻转练习：展示英文单词，从当前章节（自定义单词本内容）的释义里抽取干扰项，四选一。
 * 答错标红并计入错误（结果页会汇总显示），答对自动进入下一个单词。
 */
export default function FlipPractice() {
  // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
  const { state, dispatch } = useContext(TypingContext)!
  const [, playBeepSound, playHintSound] = useKeySounds()

  const words = state.chapterData.words
  const index = state.chapterData.index
  const totalCount = words.length
  const currentWord = words[index]

  const correctAnswer = useMemo(() => currentWord?.trans.join('；') ?? '', [currentWord])

  // 正确答案的显示文本（与所有选项一样去掉词性前缀），点击判定也基于它
  const correctDisplay = useMemo(() => {
    const cleaned = cleanTrans(correctAnswer)
    return cleaned.length > 0 ? cleaned : correctAnswer
  }, [correctAnswer])

  // 其他词本的释义池：挂载后异步加载（按词本缓存），加载完成前先用本章节内容
  const currentDictId = useAtomValue(currentDictIdAtom)
  const currentDictInfo = useAtomValue(currentDictInfoAtom)
  const [extraTransPool, setExtraTransPool] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    getExtraTransPool(currentDictId, currentDictInfo.language).then((pool) => {
      if (!cancelled) setExtraTransPool(pool)
    })
    return () => {
      cancelled = true
    }
    // 仅在进入翻转练习时加载一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const options = useMemo(() => {
    if (!currentWord) return []

    // 候选池（均为显示用文本）：本章节其他单词的释义 + 其他词本抽样释义（只取其中一个中文词），
    // 均剔除空串、重复以及与正确答案过于相近的
    const chapterCandidates = Array.from(
      new Set(
        words
          .filter((_, i) => i !== index)
          .map((w) => cleanTrans(w.trans.join('；')))
          .filter((t) => t.length > 0 && !isSimilarTrans(t, correctDisplay)),
      ),
    )
    const otherCandidates = Array.from(
      new Set(extraTransPool.map(shortenTrans).filter((t) => t.length >= 2 && !isSimilarTrans(t, correctDisplay))),
    )

    // 干扰项：同章节优先占 2 席（保持针对性），其余由其他词本补足，两者都随机抽取并打乱
    const chapterDistractors = shuffle(chapterCandidates).slice(0, CHAPTER_DISTRACTOR_SLOTS)
    const usedSet = new Set(chapterDistractors)
    const otherDistractors = shuffle(otherCandidates.filter((t) => !usedSet.has(t))).slice(
      0,
      OPTION_COUNT - 1 - chapterDistractors.length,
    )
    const distractors = [...chapterDistractors, ...otherDistractors]

    // 其他词本不可用时，用本章节候选补齐名额
    if (distractors.length < OPTION_COUNT - 1) {
      const filled = new Set(distractors)
      distractors.push(...shuffle(chapterCandidates.filter((t) => !filled.has(t))).slice(0, OPTION_COUNT - 1 - distractors.length))
    }

    // 选项顺序打乱
    return shuffle([correctDisplay, ...distractors])
  }, [currentWord, correctDisplay, index, words, extraTransPool])

  // 当前已选错的选项（保持标红，重复点击同一错误项不重复计错）
  const [wrongPickedList, setWrongPickedList] = useState<string[]>([])
  const [isAdvancing, setIsAdvancing] = useState(false)

  useEffect(() => {
    setWrongPickedList([])
    setIsAdvancing(false)
  }, [currentWord])

  const finishChapter = useCallback(() => {
    dispatch({ type: TypingStateActionType.FINISH_CHAPTER })
  }, [dispatch])

  const advance = useCallback(() => {
    if (index >= totalCount - 1) {
      finishChapter()
    } else {
      dispatch({ type: TypingStateActionType.NEXT_WORD })
    }
  }, [dispatch, finishChapter, index, totalCount])

  const handlePick = useCallback(
    (option: string) => {
      if (isAdvancing || !currentWord) return
      if (option === correctDisplay) {
        setIsAdvancing(true)
        playHintSound()
        dispatch({ type: TypingStateActionType.INCREASE_CORRECT_COUNT })
        dispatch({ type: TypingStateActionType.REPORT_CORRECT_WORD })
        window.setTimeout(advance, ADVANCE_DELAY_MS)
      } else {
        if (!wrongPickedList.includes(option)) {
          playBeepSound()
          dispatch({ type: TypingStateActionType.INCREASE_WRONG_COUNT })
          dispatch({ type: TypingStateActionType.REPORT_WRONG_WORD })
        }
        setWrongPickedList((old) => [...old, option])
      }
    },
    [advance, correctDisplay, currentWord, dispatch, isAdvancing, playBeepSound, playHintSound, wrongPickedList],
  )

  useHotkeys(
    '1,2,3,4',
    (event) => {
      const option = options[Number(event.key) - 1]
      if (option !== undefined) {
        handlePick(option)
      }
    },
    { preventDefault: true },
  )

  if (!currentWord) return null

  const progressPercent = Math.round(((index + 1) / totalCount) * 100)

  return (
    <div className="flex w-full flex-col items-center justify-center">
      {/* 进度条与结束按钮 */}
      <div className="mb-8 flex w-full max-w-2xl items-center gap-4 px-4">
        <span className="whitespace-nowrap text-base text-gray-500 dark:text-gray-400">
          {index + 1} / {totalCount}
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div className="brand-gradient h-full rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
        </div>
        <button
          type="button"
          onClick={finishChapter}
          className="whitespace-nowrap rounded-lg px-3 py-1 text-base text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
        >
          结束练习
        </button>
      </div>

      {/* 英文单词 */}
      <div className="relative flex items-center justify-center">
        <div className="font-mono text-6xl text-gray-600 dark:text-gray-50 dark:text-opacity-80 md:text-7xl">{currentWord.name}</div>
        <WordSound
          word={currentWord.name}
          inputWord=""
          transText={correctDisplay}
          exampleText={currentWord.example?.[0]?.en}
          className="h-10 w-10"
        />
      </div>

      <div className="mt-4 text-base text-gray-400 dark:text-gray-500">选择正确的中文释义（可按 1-4 键）</div>

      {/* 中文释义选项 */}
      <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-4 px-4 sm:grid-cols-2">
        {options.map((option, i) => {
          const isWrong = wrongPickedList.includes(option)
          const isCorrect = option === correctDisplay && isAdvancing
          return (
            <button
              key={`${i}-${option}`}
              type="button"
              onClick={() => handlePick(option)}
              className={`flex items-center rounded-xl border-2 border-solid px-5 py-4 text-xl transition-colors duration-150 dark:text-gray-200 ${
                isCorrect
                  ? 'border-green-400 bg-green-50 text-green-600 dark:border-green-600 dark:bg-green-900/40 dark:text-green-400'
                  : isWrong
                    ? `border-red-400 bg-red-50 text-red-500 dark:border-red-600 dark:bg-red-900/40 dark:text-red-400 ${styles.wrong}`
                    : 'border-indigo-300 bg-white text-gray-700 hover:bg-indigo-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700'
              }`}
            >
              <span className="mr-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-base text-indigo-500 dark:bg-gray-700 dark:text-gray-300">
                {i + 1}
              </span>
              <span className="text-left leading-snug">{option}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
