import { Dialog, Transition } from '@headlessui/react'
import { localDictionaries, idDictionaryMap, initLocalDictionries } from '@/resources/dictionary'
import { currentChapterAtom, currentDictIdAtom, currentDictInfoAtom } from '@/store'
import type { Dictionary } from '@/typings'
import { safeTrack } from '@/utils'
import { delLocalDict, onLocalDictChange } from '@/utils/local-dict'
import { useAtom, useAtomValue } from 'jotai'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import IconAdd from '~icons/tabler/plus'
import IconChevronRight from '~icons/tabler/chevron-right'
import IconBook from '~icons/tabler/book'
import IconMistake from '~icons/tabler/alert-triangle'
import IconCheck from '~icons/tabler/check'
import IconChevronUp from '~icons/tabler/chevron-up'
import IconX from '~icons/tabler/x'

/**
 * 首页底部「我的题集」面板
 * - 默认收起：仅在屏幕底部显示一个手柄条
 * - 鼠标悬停/聚焦时：自动平滑展开
 * - 鼠标离开后：延迟 300ms 自动收起
 */
export default function CustomDictPanel() {
  const [customDicts, setCustomDicts] = useState<Dictionary[]>([])
  const [mistakeDicts, setMistakeDicts] = useState<Dictionary[]>([])
  const [expanded, setExpanded] = useState(false)
  const [, setCurrentDictId] = useAtom(currentDictIdAtom)
  const [, setCurrentChapter] = useAtom(currentChapterAtom)
  const currentDictInfo = useAtomValue(currentDictInfoAtom)
  const navigate = useNavigate()
  const closeTimerRef = useRef<number | null>(null)

  const total = customDicts.length + mistakeDicts.length

  const refresh = useCallback(() => {
    initLocalDictionries()
    const locals = [...localDictionaries]
    setCustomDicts(locals.filter((d) => d.languageCategory === 'custom'))
    setMistakeDicts(locals.filter((d) => d.languageCategory === 'mistake'))
  }, [])

  useEffect(() => {
    refresh()
    return onLocalDictChange(refresh)
  }, [refresh])

  const handleEnter = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setExpanded(true)
  }, [])

  const handleLeave = useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      setExpanded(false)
    }, 300)
  }, [])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  const handleSwitchDict = (dict: Dictionary) => {
    if (!idDictionaryMap[dict.id]) {
      initLocalDictionries()
    }
    setCurrentChapter(0)
    setCurrentDictId(dict.id)
    safeTrack('Switch Dict', { dict: dict.name, source: 'home_panel' })
    toast.success(`已切换到「${dict.name}」`)
  }

  const handleDeleteDict = useCallback((dict: Dictionary) => {
    if (dict.id === currentDictInfo.id) {
      const remaining = customDicts.filter((d) => d.id !== dict.id)
      if (remaining.length > 0) {
        setCurrentChapter(0)
        setCurrentDictId(remaining[0].id)
      }
    }
  }, [customDicts, currentDictInfo.id, setCurrentChapter, setCurrentDictId])

  const handleAddNew = () => {
    safeTrack('Open Add Dict', { source: 'home_panel' })
    navigate('/gallery')
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-2 sm:pb-3"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div
        className={`pointer-events-auto w-full max-w-5xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          expanded ? 'translate-y-0 opacity-100' : 'translate-y-[calc(100%-44px)] opacity-95'
        }`}
      >
        <div className="glass-card relative overflow-hidden">
          {/* 顶部手柄条 - 始终可见，作为展开触发器 */}
          <div
            className="flex h-11 cursor-pointer items-center justify-between px-4 sm:px-5"
            onClick={() => setExpanded((v) => !v)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setExpanded((v) => !v)
            }}
            aria-label={expanded ? '收起我的题集' : '展开我的题集'}
          >
            <div className="flex items-center gap-2">
              <div className="brand-gradient flex h-7 w-7 items-center justify-center rounded-md text-white shadow-sm">
                <IconBook className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-100">我的题集</span>
              {total > 0 && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                  {total}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span className="hidden sm:inline">{expanded ? '将光标移开自动收起' : '光标移上自动展开'}</span>
              <IconChevronUp
                className={`h-4 w-4 transition-transform duration-300 ${expanded ? '' : 'rotate-180'}`}
              />
            </div>
          </div>

          {/* 展开内容 */}
          <div
            className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="overflow-hidden">
              <div className="px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
                {total === 0 ? (
                  <EmptyState onAdd={handleAddNew} />
                ) : (
                  <div className="space-y-4">
                    {customDicts.length > 0 && (
                      <DictCardGrid
                        title="自定义词典"
                        icon={<IconBook className="h-4 w-4" />}
                        dicts={customDicts}
                        currentDictId={currentDictInfo.id}
                        onSelect={handleSwitchDict}
                        onDelete={handleDeleteDict}
                      />
                    )}
                    {mistakeDicts.length > 0 && (
                      <DictCardGrid
                        title="错题集"
                        icon={<IconMistake className="h-4 w-4" />}
                        dicts={mistakeDicts}
                        currentDictId={currentDictInfo.id}
                        onSelect={handleSwitchDict}
                        onDelete={handleDeleteDict}
                      />
                    )}
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleAddNew}
                        className="brand-gradient group flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white shadow-md transition-all duration-200 hover:scale-105"
                      >
                        <IconAdd className="h-3.5 w-3.5 transition-transform group-hover:rotate-90" />
                        <span>添加词典</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface DictCardGridProps {
  title: string
  icon: React.ReactNode
  dicts: Dictionary[]
  currentDictId: string
  onSelect: (dict: Dictionary) => void
  onDelete?: (dict: Dictionary) => void
}

function DictCardGrid({ title, icon, dicts, currentDictId, onSelect, onDelete }: DictCardGridProps) {
  const [pendingDelete, setPendingDelete] = useState<Dictionary | null>(null)

  const handleDeleteClick = useCallback((e: React.MouseEvent, dict: Dictionary) => {
    e.stopPropagation()
    setPendingDelete(dict)
  }, [])

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return
    delLocalDict(pendingDelete.id)
    if (onDelete) onDelete(pendingDelete)
    toast.success(`已删除「${pendingDelete.name}」`)
    setPendingDelete(null)
  }, [pendingDelete, onDelete])

  const cancelDelete = useCallback(() => {
    setPendingDelete(null)
  }, [])

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-600 dark:text-gray-300">
        {icon}
        <span>{title}</span>
        <span className="text-xs font-normal text-gray-400">({dicts.length})</span>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {dicts.map((dict) => {
          const isActive = dict.id === currentDictId
          return (
            <button
              key={dict.id}
              onClick={() => onSelect(dict)}
              className="group relative flex w-full items-center justify-between overflow-hidden rounded-xl border p-3 text-left transition-all duration-200 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-500"
              style={{
                borderColor: isActive ? undefined : undefined,
                backgroundColor: isActive ? undefined : undefined,
              }}
            >
              <div
                className={`absolute inset-0 -z-10 transition-colors ${
                  isActive ? 'bg-indigo-50/80 dark:bg-indigo-900/30' : 'bg-white/80 dark:bg-gray-800/80'
                } group-hover:bg-white dark:group-hover:bg-gray-800`}
              />
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isActive ? 'brand-gradient text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-indigo-100 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {isActive ? <IconCheck className="h-4 w-4" /> : <IconBook className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{dict.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{dict.length ?? 0} 词</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {onDelete && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleDeleteClick(e, dict)}
                    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gray-200/60 text-gray-400 transition-all duration-200 hover:bg-red-500 hover:text-white dark:bg-gray-700/60 dark:hover:text-white"
                    title="删除词典"
                    aria-label="删除词典"
                  >
                    <IconX className="h-3 w-3" />
                  </span>
                )}
                <IconChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-indigo-500" />
              </div>
            </button>
          )
        })}
      </div>

      {/* 删除确认弹窗 */}
      <Transition show={pendingDelete !== null} as={Fragment}>
        <Dialog
          as="div"
          className="fixed inset-0 z-50 overflow-y-auto"
          onClose={cancelDelete}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-h-screen items-center justify-center px-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
            </Transition.Child>

            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <div className="my-8 inline-block w-full max-w-sm transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-gray-800">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                    <IconX className="h-5 w-5 text-red-500" />
                  </div>
                  <Dialog.Title as="h3" className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    确认删除
                  </Dialog.Title>
                </div>
                <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                  确定要删除词典「<span className="font-medium text-red-500">{pendingDelete?.name}</span>」吗？
                  <br />
                  删除后将无法恢复。
                </div>

                <div className="mt-5 flex justify-end gap-3">
                  <button
                    type="button"
                    className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    onClick={cancelDelete}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
                    onClick={confirmDelete}
                  >
                    删除
                  </button>
                </div>
              </div>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-4">
      <div className="brand-gradient-soft mb-2 flex h-12 w-12 items-center justify-center rounded-xl">
        <IconBook className="h-6 w-6 text-indigo-500" />
      </div>
      <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">还没有自定义词典</p>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">支持 json / xls / xlsx 格式，一键开启专属题库</p>
      <button
        onClick={onAdd}
        className="brand-gradient group flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium text-white shadow-md transition-all duration-200 hover:scale-105"
      >
        <IconAdd className="h-3.5 w-3.5 transition-transform group-hover:rotate-90" />
        <span>立即添加</span>
      </button>
    </div>
  )
}
