import { useCallback, useState } from "react"
import { processVideoToImage } from "../utils"

type UseVideoProcessingArgs = {
  onError?: (error: ErrorNotice) => void
}

const INITIAL_PROGRESS: VideoProcessingProgress = { phase: "loading", current: 0, total: 0, percent: 0 }

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return "Unknown error"
}

export const useVideoProcessing = ({ onError }: UseVideoProcessingArgs = {}) => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState<VideoProcessingProgress>(INITIAL_PROGRESS)
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
        const result = await processVideoToImage(blob, setProgress)
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
