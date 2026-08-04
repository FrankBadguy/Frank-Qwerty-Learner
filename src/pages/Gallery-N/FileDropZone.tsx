import type { DragEvent, FC } from 'react'
import { useRef, useState } from 'react'

interface Props {
  onFilesSelected: (files: File[]) => void
}

const FileDropZone: FC<Props> = ({ onFilesSelected, children }) => {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    if (files.length > 0) {
      onFilesSelected(files)
    }
    // 重置 input 以允许重复选择同一文件
    event.target.value = ''
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(true)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)

    const files = Array.from(event.dataTransfer?.files || [])
    onFilesSelected(files)
  }

  return (
    <div
      className={`cursor-pointer rounded-lg border-2 border-dashed border-gray-400 p-4 ${isDragging ? 'bg-gray-100' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.xls,.xlsx"
        className="hidden"
        onChange={handleFileChange}
      />
      {children}
    </div>
  )
}

export default FileDropZone
