import { dictionaries } from '@/resources/dictionary'
import type { Dictionary } from '@/typings/index'
import shuffle from '@/utils/shuffle'

// 每个词本最多抽取的释义条数，控制内存与选项生成开销
const PER_DICT_SAMPLE = 120
// 最多加载几个其他词本
const MAX_DICTS = 2

const poolCache = new Map<string, string[]>()

function extractTrans(words: { trans?: string[] }[]): string[] {
  return words
    .map((w) => (w.trans ? w.trans.join('；') : ''))
    .filter((t) => t.length > 0)
}

async function loadDictTrans(dict: Dictionary): Promise<string[]> {
  const cached = poolCache.get(dict.id)
  if (cached) return cached

  let words: { trans?: string[] }[] = []
  try {
    if (['custom', 'mistake'].includes(dict.languageCategory)) {
      // 自定义/生词本等本地词本
      words = (await window.readLocalDict(dict.id)) ?? []
    } else {
      // 内置词本：与 useWordList 相同的 JSON 地址规则
      const URL_PREFIX: string = REACT_APP_DEPLOY_ENV === 'pages' ? '/qwerty-learner' : ''
      const response = await fetch('.' + URL_PREFIX + dict.url)
      words = await response.json()
    }
  } catch (err) {
    console.warn('[FlipPractice] 加载干扰项词本失败:', dict.id, err)
  }

  const pool = shuffle(extractTrans(words)).slice(0, PER_DICT_SAMPLE)
  poolCache.set(dict.id, pool)
  return pool
}

/**
 * 从其他词本中抽取一批中文释义，作为翻转练习的干扰项来源，
 * 避免同一章节内释义过于相近导致选项难以区分。
 * 优先取与当前词本同语言的词本；结果会按词本 id 缓存。
 */
export async function getExtraTransPool(currentDictId: string, language: string): Promise<string[]> {
  const candidates = dictionaries.filter((d) => d.id !== currentDictId)
  if (candidates.length === 0) return []

  const sameLang = shuffle(candidates.filter((d) => d.language === language))
  const otherLang = shuffle(candidates.filter((d) => d.language !== language))
  const picks = [...sameLang, ...otherLang].slice(0, MAX_DICTS)

  const pools = await Promise.all(picks.map((dict) => loadDictTrans(dict)))
  return pools.flat()
}
