import { TypingContext, TypingStateActionType } from '../../store'
import WordCard from './WordCard'
import Drawer from '@/components/Drawer'
import { currentChapterAtom, currentDictInfoAtom } from '@/store'
import { Dialog } from '@headlessui/react'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { atom, useAtomValue } from 'jotai'
import { useContext, useState } from 'react'
import ListIcon from '~icons/tabler/list'
import IconX from '~icons/tabler/x'
import { getLocalDictContent } from '@/utils/local-dict'
import type { Word } from '@/typings'

const currentDictTitle = atom((get) => {
  return `${get(currentDictInfoAtom).name} 第 ${get(currentChapterAtom) + 1} 章`
})

export default function WordList() {
  // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
  const { state, dispatch } = useContext(TypingContext)!

  const [isOpen, setIsOpen] = useState(false)
  const currentDictTitleValue = useAtomValue(currentDictTitle)
  const currentDictInfo = useAtomValue(currentDictInfoAtom)

  const isLocalDict = ['custom', 'mistake'].includes(currentDictInfo.languageCategory)

  function closeModal() {
    setIsOpen(false)
  }

  function openModal() {
    setIsOpen(true)
    dispatch({ type: TypingStateActionType.SET_IS_TYPING, payload: false })
  }

  function handleDeleteWord(index: number) {
    const word = state.chapterData.words[index]
    if (!word) return

    if (isLocalDict) {
      const allWords = getLocalDictContent(currentDictInfo.id)
      if (allWords) {
        const updatedWords = allWords.filter((w: Word) => w.name !== word.name)
        const contentKey = `qwerty-local-dict-content::${currentDictInfo.id}`
        const mistakeKey = `qwerty-local-mistake-dict::${currentDictInfo.id}`
        if (localStorage.getItem(contentKey)) {
          localStorage.setItem(contentKey, JSON.stringify(updatedWords))
        } else if (localStorage.getItem(mistakeKey)) {
          localStorage.setItem(mistakeKey, JSON.stringify(updatedWords))
        }
      }
    }

    dispatch({ type: TypingStateActionType.REMOVE_WORD, payload: index })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="fixed left-0 top-[50%] z-20 rounded-lg rounded-l-none bg-indigo-50 px-2 py-3 text-lg hover:bg-indigo-200 focus:outline-none dark:bg-indigo-900 dark:hover:bg-indigo-800"
      >
        <ListIcon className="h-6 w-6 text-lg text-indigo-500 dark:text-white" />
      </button>

      <Drawer open={isOpen} onClose={closeModal} classNames="bg-stone-50 dark:bg-gray-900">
        <Dialog.Title as="h3" className="flex items-center justify-between p-4 text-lg font-medium leading-6 dark:text-gray-50">
          {currentDictTitleValue}
          <IconX onClick={closeModal} className="cursor-pointer" />
        </Dialog.Title>
        <ScrollArea.Root className="flex-1 select-none overflow-y-auto ">
          <ScrollArea.Viewport className="h-full w-full px-3">
            <div className="flex h-full w-full flex-col gap-1">
              {state.chapterData.words?.map((word, index) => {
                return (
                  <WordCard
                    word={word}
                    key={`${word.name}_${index}`}
                    isActive={state.chapterData.index === index}
                    index={index}
                    onDelete={handleDeleteWord}
                  />
                )
              })}
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar className="flex touch-none select-none bg-transparent " orientation="vertical"></ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </Drawer>
    </>
  )
}