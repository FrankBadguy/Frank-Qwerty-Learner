import type { Word } from '@/typings'
import IconX from '~icons/tabler/x'

export default function WordCard({
  word,
  isActive,
  index,
  onDelete,
}: {
  word: Word
  isActive: boolean
  index: number
  onDelete: (index: number) => void
}) {
  return (
    <div
      className={`relative mb-2 rounded-xl ${
        isActive ? 'bg-indigo-50 dark:bg-indigo-800 dark:bg-opacity-20' : 'bg-white dark:bg-gray-700 dark:bg-opacity-20'
      } select-text p-4 pr-10 shadow focus:outline-none`}
      key={word.name}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete(index)
        }}
        className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-gray-200/80 text-gray-500 shadow-sm transition-all duration-200 hover:bg-red-500 hover:text-white hover:shadow-md dark:bg-gray-700/80 dark:text-gray-300"
        title="删除单词"
        aria-label="删除单词"
      >
        <IconX className="h-3 w-3" />
      </button>
      <p className="select-all font-mono text-xl font-normal leading-6 dark:text-gray-50">{word.name}</p>
      <div className="mt-2 font-sans text-sm text-gray-400">{word.trans}</div>
    </div>
  )
}