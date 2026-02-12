import { type ChangeEvent, useRef, useState } from "react"
import Instructions from "components/Instructions"
import ProgressBar from "components/ProgressBar"
import { UI_CONFIG } from "./config"
import { processVideoMaxBrightness } from "./processors"

type ProgressState = {
  current: number
  total: number
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return "Unknown error"
}

const MemoryGame = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 0 })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const processVideo = async (blob: Blob) => {
    setIsProcessing(true)
    setProgress({ current: 0, total: 0 })
    setResultImage(null)

    try {
      const onProgress = (current: number, total: number) => {
        setProgress({ current, total })
      }

      const result = await processVideoMaxBrightness(blob, onProgress)
      setResultImage(result)
    } catch (error) {
      console.error("Processing error:", error)
      alert(`Processing failed: ${getErrorMessage(error)}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      void processVideo(file)
    }

    // Allow selecting the same file again.
    event.target.value = ""
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      })

      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" })
        void processVideo(blob)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      alert(`Recording failed: ${getErrorMessage(error)}`)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleReset = () => {
    setResultImage(null)
    setProgress({ current: 0, total: 0 })
    setIsProcessing(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-3xl font-bold text-gray-800">7k memory solver</h1>

        <Instructions />

        <div className="mb-6 flex gap-3">
          {UI_CONFIG.showUploadButton && (
            <>
              <input type="file" accept="video/*" ref={fileInputRef} onChange={handleUpload} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:bg-gray-400"
              >
                Upload Video
              </button>
            </>
          )}

          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={isProcessing}
              className="rounded bg-red-600 px-5 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:bg-gray-400"
            >
              Screen Record
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="rounded bg-red-700 px-5 py-2 font-medium text-white transition-colors hover:bg-red-800"
            >
              Stop Recording
            </button>
          )}
        </div>

        {isProcessing && (
          <ProgressBar current={progress.current} total={progress.total} label="Processing video frames..." />
        )}

        {resultImage && (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold text-gray-800">Result</h2>
            <img src={resultImage} alt="Processed result" className="max-w-full rounded border border-gray-300" />
            <div className="mt-4 flex gap-3">
              <a
                href={resultImage}
                download="memory-game-solution.png"
                className="inline-block rounded bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
              >
                Download Solution
              </a>
              <button
                onClick={handleReset}
                className="rounded bg-gray-600 px-4 py-2 text-white transition-colors hover:bg-gray-700"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MemoryGame
