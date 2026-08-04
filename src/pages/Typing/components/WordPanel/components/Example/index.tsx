import { isTextSelectableAtom } from '@/store'
import type { WordWithIndex } from '@/typings'
import { useAtomValue } from 'jotai'

export type ExampleProps = {
  word: WordWithIndex
}

/**
 * 在单词卡片音标位置展示双语例句（取词条的第一条例句）
 * 例句由词典 JSON 的 example 字段提供，无例句时由上层回退到音标展示
 */
function Example({ word }: ExampleProps) {
  const isTextSelectable = useAtomValue(isTextSelectableAtom)
  const example = word.example?.[0]
  if (!example) return null

  return (
    <div
      className={`space-y-1 pt-1 text-center transition-colors duration-300 ${
        isTextSelectable && 'select-text'
      }`}
    >
      <p className="max-w-4xl font-sans text-base font-normal text-gray-600 dark:text-gray-400">{example.en}</p>
      {example.zh && (
        <p className="max-w-4xl font-sans text-sm font-normal text-gray-500 dark:text-gray-500">{example.zh}</p>
      )}
    </div>
  )
}

export default Example
