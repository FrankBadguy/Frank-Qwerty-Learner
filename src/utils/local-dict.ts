import type { DictionaryResource, Word } from '@/typings'

/**
 * localStorage key for storing user-defined dictionaries metadata
 * Each value is a JSON-stringified DictionaryResource
 */
const STORAGE_KEY_DICTS = 'qwerty-local-dicts'

/**
 * localStorage key for storing the JSON word list of each user dict
 * Format: qwerty-local-dict-content::{id} -> JSON-stringified Word[]
 */
const STORAGE_KEY_DICT_CONTENT_PREFIX = 'qwerty-local-dict-content::'

/**
 * localStorage key for storing the user mistake dictionaries
 * Format: qwerty-local-mistake-dict::{id} -> JSON-stringified Word[]
 */
const STORAGE_KEY_MISTAKE_PREFIX = 'qwerty-local-mistake-dict::'

/**
 * Read all local dict configurations (metadata)
 */
export function readLocalDictConfig(): DictionaryResource[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DICTS)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
  } catch {
    return []
  }
}

/**
 * 持久化自定义词典元数据（内部 + 外部共用）
 */
export function writeLocalDictConfig(configs: DictionaryResource[]) {
  localStorage.setItem(STORAGE_KEY_DICTS, JSON.stringify(configs))
  emitLocalDictChange()
}

/**
 * 派发自定义词典变更事件，通知 UI 重新加载
 */
function emitLocalDictChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('qwerty-local-dict-change'))
  }
}

/**
 * 监听自定义词典变更事件
 */
export function onLocalDictChange(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('qwerty-local-dict-change', handler)
  return () => window.removeEventListener('qwerty-local-dict-change', handler)
}

/**
 * Save a new local dictionary from a JSON word array
 */
export function newLocalDictFromJson(jsonData: Word[], dictMeta: DictionaryResource) {
  const configs = readLocalDictConfig()
  // 避免重复 id
  const exists = configs.find((c) => c.id === dictMeta.id)
  if (!exists) {
    configs.push(dictMeta)
    writeLocalDictConfig(configs)
  }
  // 保存词表内容
  localStorage.setItem(STORAGE_KEY_DICT_CONTENT_PREFIX + dictMeta.id, JSON.stringify(jsonData))
  emitLocalDictChange()
}

/**
 * Save a local mistake dictionary (from typing-mistake-db exported records)
 */
export function newLocalMistakeDictFromJson(jsonData: Word[], dictMeta: DictionaryResource) {
  const configs = readLocalDictConfig()
  const exists = configs.find((c) => c.id === dictMeta.id)
  if (!exists) {
    configs.push(dictMeta)
    writeLocalDictConfig(configs)
  }
  localStorage.setItem(STORAGE_KEY_MISTAKE_PREFIX + dictMeta.id, JSON.stringify(jsonData))
  emitLocalDictChange()
}

/**
 * Delete a local dict by id (removes both metadata and content)
 * Returns true if a dict was removed.
 */
export function delLocalDict(dictId: string): boolean {
  const configs = readLocalDictConfig()
  const filtered = configs.filter((c) => c.id !== dictId)
  if (filtered.length === configs.length) {
    return false
  }
  writeLocalDictConfig(filtered)
  localStorage.removeItem(STORAGE_KEY_DICT_CONTENT_PREFIX + dictId)
  localStorage.removeItem(STORAGE_KEY_MISTAKE_PREFIX + dictId)
  emitLocalDictChange()
  return true
}

/**
 * Get the word list for a given local dict id
 * Returns null if not found or not a local dict
 */
export function getLocalDictContent(dictId: string): Word[] | null {
  // 先查找内容存储
  const contentKey = STORAGE_KEY_DICT_CONTENT_PREFIX + dictId
  const mistakeKey = STORAGE_KEY_MISTAKE_PREFIX + dictId

  for (const key of [contentKey, mistakeKey]) {
    const raw = localStorage.getItem(key)
    if (raw) {
      try {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) return arr as Word[]
      } catch {
        // ignore
      }
    }
  }
  return null
}

/**
 * Register a loader interceptor so that built-in fetch() requests
 * for local dict paths (e.g. /dicts/{uuid}.json) will return the content
 * stored in localStorage instead of issuing a real network request.
 *
 * This emulates the uTools behavior of "putting a virtual file under /dicts"
 * so the rest of the codebase can keep using the regular `fetch(dict.url)` path.
 */
let fetchInterceptorInstalled = false
export function installLocalDictFetchInterceptor() {
  if (fetchInterceptorInstalled) return
  if (typeof window === 'undefined') return
  fetchInterceptorInstalled = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = ''
    if (typeof input === 'string') {
      url = input
    } else if (input instanceof URL) {
      url = input.toString()
    } else if (typeof Request !== 'undefined' && input instanceof Request) {
      url = input.url
    }

    // 仅处理本应用本地词典路径，形如 /dicts/<id>.json
    if (url.includes('/dicts/') && url.endsWith('.json')) {
      const filename = url.split('/dicts/').pop() || ''
      const id = filename.replace(/\.json$/, '')
      const localContent = getLocalDictContent(id)
      if (localContent) {
        return new Response(JSON.stringify(localContent), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    return originalFetch(input, init)
  }
}

// 在模块加载时立即安装拦截器
installLocalDictFetchInterceptor()

// 兼容 uTools 时代的 window 桥接调用点
declare global {
  interface Window {
    readLocalDictConfig: () => DictionaryResource[]
    readLocalDict: (id: string) => Promise<Word[]>
    newLocalDictFromJson: (jsonData: Word[], dictMeta: DictionaryResource) => void
    newLocalMistakeDictFromJson: (jsonData: Word[], dictMeta: DictionaryResource) => void
    delLocalDict: (dictId: string) => boolean
    writeLocalDictConfig: (configs: DictionaryResource[]) => void
    initLocalDictionries: () => void
  }
}

async function readLocalDict(id: string): Promise<Word[]> {
  const content = getLocalDictContent(id)
  if (!content) return []
  return content
}

window.readLocalDictConfig = readLocalDictConfig
window.readLocalDict = readLocalDict
window.newLocalDictFromJson = newLocalDictFromJson
window.newLocalMistakeDictFromJson = newLocalMistakeDictFromJson
window.delLocalDict = delLocalDict
window.writeLocalDictConfig = writeLocalDictConfig
// 桥接函数就绪后补调一次初始化：dictionary.ts 的模块级 initLocalDictionries() 可能
// 早于本文件的 window 桥接赋值执行（取决于打包顺序），导致首次 init 拿不到配置、
// 自定义词典未收录进 idDictionaryMap；此处兜底确保 map 始终就绪。
// initLocalDictionries 内部会重置 localDictionaries 再重建，重复调用幂等。
window.initLocalDictionries?.()
