import { GalleryContext } from './'
import Tooltip from '@/components/Tooltip'
import { exportErrorDictToJson, getRecordingDict } from '@/utils/typing-mistake-db'
import { useContext, useEffect, memo } from 'react'
import { toast } from 'react-toastify'
import IconRefresh from '~icons/tabler/refresh'

function RefreshMistakeDict({ onRefresh }) {
  const { state } = useContext(GalleryContext)

  useEffect(() => {
    const handleBtnClick = async () => {
      const recordingDicts = await getRecordingDict()

      for (const dict of recordingDicts) {
        const { errorDictId, jsonData } = await exportErrorDictToJson(dict.id)

        // 生成错题词典
        if (jsonData.length >= 0) {
          const MistakeDictMeta = {
            id: errorDictId,
            name: dict.name.trim() + ' 错题',
            language: dict.language,
          }
          saveMistakeDict(MistakeDictMeta, jsonData)
        }
      }
      window.initLocalDictionries()
      onRefresh()
    }
    handleBtnClick()
  }, [])

  const handleBtnClick = async () => {
    const recordingDicts = await getRecordingDict()

    for (const dict of recordingDicts) {
      const { errorDictId, jsonData } = await exportErrorDictToJson(dict.id)

      // 生成错题词典
      if (jsonData.length >= 0) {
        const MistakeDictMeta = {
          id: errorDictId,
          name: dict.name.trim() + ' 错题',
          language: dict.language,
        }
        saveMistakeDict(MistakeDictMeta, jsonData)
      }
    }
    window.initLocalDictionries()
    onRefresh()
  }

  return <></>
}
// todo: 拿不到旧词典的id
const saveMistakeDict = (dictMeta, jsonData) => {
  const createDictMeta = (meta) => {
    const { id, name, language } = meta
    return {
      id,
      name: name,
      url: `/dicts/${id}.json`,
      language,
      description: '',
      category: '错题集',
      tags: ['Default'],
      languageCategory: 'mistake',
      length: jsonData.length,
    }
  }
  window.newLocalMistakeDictFromJson(jsonData, createDictMeta(dictMeta))
}
export default memo(RefreshMistakeDict)
