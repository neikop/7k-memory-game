import { useCallback, useState } from "react"
import { processVideoToImage } from "../utils"

type ProgressState = {
  current: number
  total: number
}

type UseVideoProcessingArgs = {
  onError?: (error: ErrorNotice) => void
}

const INITIAL_PROGRESS: ProgressState = { current: 0, total: 0 }

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return "Unknown error"
}

const useVideoProcessing = ({ onError }: UseVideoProcessingArgs = {}) => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState<ProgressState>(INITIAL_PROGRESS)
  const [resultImage, setResultImage] = useState<string | null>(null)

  const clearResult = useCallback(() => {
    setResultImage(null)
    setProgress(INITIAL_PROGRESS)
  }, [])

  const processVideo = useCallback(
    async (blob: Blob) => {
      setIsProcessing(true)
      setProgress(INITIAL_PROGRESS)
      setResultImage(null)

      try {
        const result = await processVideoToImage(blob, (current, total) => {
          setProgress({ current, total })
        })
        setResultImage(result)
      } catch (error) {
        onError?.({
          title: "Video Processing Failed",
          description: getErrorMessage(error),
        })
      } finally {
        setIsProcessing(false)
      }
    },
    [onError],
  )

  return {
    isProcessing,
    processVideo,
    progress,
    clearResult,
    resultImage,
  }
}

export default useVideoProcessing
