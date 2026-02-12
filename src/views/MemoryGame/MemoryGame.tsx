import { Box, Button, Heading, Icon, Stack, Text } from "@chakra-ui/react"
import { type ChangeEvent, useEffect, useRef, useState } from "react"
import { FiSettings } from "react-icons/fi"
import ProcessingPanel from "./components/ProcessingPanel"
import PreviewSidebar from "./components/PreviewSidebar"
import RecordingActions from "./components/RecordingActions"
import ResultPanel from "./components/ResultPanel"
import SettingsDialog from "./components/SettingsDialog"
import { processVideoToImage } from "./processVideoToImage"

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

const MP4_MIME_CANDIDATES = ["video/mp4"]
const WEBM_MIME_CANDIDATES = ["video/webm"]

const pickSupportedMimeType = (candidates: string[]): string | null =>
  candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null

const getFileExtensionFromMimeType = (mimeType: string): "mp4" | "webm" => (mimeType.includes("mp4") ? "mp4" : "webm")

const MemoryGame = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [hasActiveShare, setHasActiveShare] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAutoStopEnabled, setIsAutoStopEnabled] = useState(true)
  const [isConnectedPreviewVisible, setIsConnectedPreviewVisible] = useState(true)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null)
  const [recordedVideoFileName, setRecordedVideoFileName] = useState("memory-game-recording.mp4")
  const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 0 })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const hiddenPreviewVideoRef = useRef<HTMLVideoElement | null>(null)
  const sidebarPreviewVideoRef = useRef<HTMLVideoElement | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const recordedVideoUrlRef = useRef<string | null>(null)

  const releaseRecordedVideoUrl = () => {
    if (!recordedVideoUrlRef.current) {
      return
    }

    URL.revokeObjectURL(recordedVideoUrlRef.current)
    recordedVideoUrlRef.current = null
  }

  const clearRecordedVideoUrl = () => {
    releaseRecordedVideoUrl()
    setRecordedVideoUrl(null)
  }

  const setRecordedVideoBlob = (blob: Blob, extension: "mp4" | "webm") => {
    clearRecordedVideoUrl()

    const nextUrl = URL.createObjectURL(blob)
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    recordedVideoUrlRef.current = nextUrl
    setRecordedVideoUrl(nextUrl)
    setRecordedVideoFileName(`memory-game-recording-${timestamp}.${extension}`)
  }

  const attachPreviewStream = async (stream: MediaStream | null) => {
    const attachToVideo = async (video: HTMLVideoElement | null) => {
      if (!video) {
        return
      }

      video.srcObject = stream

      if (stream) {
        try {
          await video.play()
        } catch {
          // Ignore autoplay rejections. Preview should not block capture flow.
        }
      }
    }

    await attachToVideo(hiddenPreviewVideoRef.current)
    await attachToVideo(sidebarPreviewVideoRef.current)
  }

  const stopRecordingStream = () => {
    if (!recordingStreamRef.current) {
      return
    }

    recordingStreamRef.current.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
    mediaRecorderRef.current = null
  }

  const stopRecorder = () => {
    if (mediaRecorderRef.current?.state !== "recording") {
      return
    }

    try {
      mediaRecorderRef.current.requestData()
    } catch {
      // Ignore flush failures and still stop recorder.
    }

    mediaRecorderRef.current.stop()
    setIsRecording(false)
  }

  const stopSharing = () => {
    if (!streamRef.current) {
      return
    }

    streamRef.current.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setHasActiveShare(false)
    setRecordingSeconds(0)
    void attachPreviewStream(null)
  }

  const ensureCaptureStream = async () => {
    const currentStream = streamRef.current
    const currentTrack = currentStream?.getVideoTracks()[0]

    if (currentStream && currentTrack && currentTrack.readyState === "live") {
      return currentStream
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    })

    streamRef.current = stream
    setHasActiveShare(true)
    void attachPreviewStream(stream)

    const videoTrack = stream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.addEventListener(
        "ended",
        () => {
          streamRef.current = null
          setHasActiveShare(false)
          setRecordingSeconds(0)
          stopRecorder()
        },
        { once: true },
      )
    }

    return stream
  }

  const processVideo = async (blob: Blob) => {
    setIsProcessing(true)
    setProgress({ current: 0, total: 0 })
    setResultImage(null)

    try {
      const onProgress = (current: number, total: number) => {
        setProgress({ current, total })
      }

      const result = await processVideoToImage(blob, onProgress)
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

  const handleDownloadRecordedVideo = () => {
    if (!recordedVideoUrl) {
      return
    }

    const anchor = document.createElement("a")
    anchor.href = recordedVideoUrl
    anchor.download = recordedVideoFileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  const startRecording = async () => {
    try {
      const existingRecorder = mediaRecorderRef.current
      if (existingRecorder && existingRecorder.state !== "inactive") {
        return
      }

      const captureStream = streamRef.current
      const captureTrack = captureStream?.getVideoTracks()[0]
      if (!captureStream || !captureTrack || captureTrack.readyState !== "live") {
        setHasActiveShare(false)
        alert("Please connect your game window first.")
        return
      }

      const captureVideoTrack = captureStream.getVideoTracks()[0]
      if (!captureVideoTrack) {
        throw new Error("No captured video track available")
      }

      // Record from a cloned track so stopping recorder does not affect the persistent capture stream.
      const recordingStream = new MediaStream([captureVideoTrack.clone()])
      recordingStreamRef.current = recordingStream

      const mp4MimeType = pickSupportedMimeType(MP4_MIME_CANDIDATES)
      const fallbackMimeType = pickSupportedMimeType(WEBM_MIME_CANDIDATES)
      const selectedMimeType = mp4MimeType ?? fallbackMimeType

      let mediaRecorder: MediaRecorder
      try {
        mediaRecorder = selectedMimeType
          ? new MediaRecorder(recordingStream, { mimeType: selectedMimeType })
          : new MediaRecorder(recordingStream)
      } catch {
        mediaRecorder = new MediaRecorder(recordingStream)
      }

      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onerror = (event) => {
        console.error("Recording error:", event)
      }

      mediaRecorder.onstop = () => {
        stopRecordingStream()

        const outputMimeType = mediaRecorder.mimeType || selectedMimeType || "video/webm"
        const blob = new Blob(chunksRef.current, { type: outputMimeType })
        const extension = getFileExtensionFromMimeType(outputMimeType)
        chunksRef.current = []

        if (blob.size > 0) {
          setRecordedVideoBlob(blob, extension)
          void processVideo(blob)
        } else {
          alert("Recorded video is empty. Please try again.")
        }
      }

      mediaRecorder.start(250)
      setRecordingSeconds(0)
      setIsRecording(true)
    } catch (error) {
      alert(`Recording failed: ${getErrorMessage(error)}`)
    }
  }

  const disconnectShare = () => {
    stopRecorder()
    chunksRef.current = []
    stopRecordingStream()
    stopSharing()
  }

  const connectShare = async () => {
    try {
      setIsConnecting(true)
      await ensureCaptureStream()
    } catch (error) {
      alert(`Window connection failed: ${getErrorMessage(error)}`)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleShareButtonClick = () => {
    if (hasActiveShare) {
      disconnectShare()
      return
    }

    void connectShare()
  }

  const handleReset = () => {
    setResultImage(null)
    setProgress({ current: 0, total: 0 })
    setIsProcessing(false)
  }

  useEffect(() => {
    if (!isRecording) {
      return
    }

    const timerId = window.setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1)
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [isRecording])

  useEffect(() => {
    if (!isRecording || !isAutoStopEnabled || recordingSeconds < 5) {
      return
    }

    stopRecorder()
  }, [isAutoStopEnabled, isRecording, recordingSeconds])

  useEffect(() => {
    const hiddenPreviewVideo = hiddenPreviewVideoRef.current
    const sidebarPreviewVideo = sidebarPreviewVideoRef.current

    return () => {
      stopRecorder()
      setRecordingSeconds(0)
      stopRecordingStream()

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      if (hiddenPreviewVideo) {
        hiddenPreviewVideo.srcObject = null
      }

      if (sidebarPreviewVideo) {
        sidebarPreviewVideo.srcObject = null
      }

      releaseRecordedVideoUrl()
    }
  }, [])

  return (
    <Box minH="100vh" bgGradient="linear(to-br, gray.100, white, blue.50)">
      <Box w="full" display="flex" justifyContent="center" px={4} py={4}>
        <Stack w="full" maxW="7xl" direction={{ base: "column", lg: "row" }} align="flex-start" gap={4}>
          <Stack flex="1" minW={0} w="full" gap={4}>
            <video
              ref={hiddenPreviewVideoRef}
              muted
              playsInline
              style={{
                position: "fixed",
                bottom: 0,
                right: 0,
                width: "1px",
                height: "1px",
                opacity: 0,
                pointerEvents: "none",
              }}
              aria-hidden
            />

            <Box
              position="relative"
              borderWidth="1px"
              borderColor="gray.200"
              bg="whiteAlpha.900"
              borderRadius="3xl"
              p={4}
              shadow="sm"
            >
              <Button
                aria-label="Open settings"
                onClick={() => setIsSettingsOpen(true)}
                size="sm"
                variant="outline"
                colorPalette="gray"
                minW="8"
                px={0}
                position="absolute"
                top={4}
                right={4}
              >
                <Icon as={FiSettings} boxSize={4} />
              </Button>

              <Stack gap={4}>
                <Heading size={{ base: "xl", md: "2xl" }} color="gray.900">
                  Seven Knights Re:BIRTH - Memory Game
                </Heading>

                <Box borderWidth="1px" borderColor="gray.200" bg="gray.50" borderRadius="2xl" px={4} py={3}>
                  <Stack gap={2}>
                    <RecordingActions
                      canDownload={Boolean(recordedVideoUrl)}
                      fileInputRef={fileInputRef}
                      hasActiveShare={hasActiveShare}
                      isConnecting={isConnecting}
                      isProcessing={isProcessing}
                      isRecording={isRecording}
                      onDownloadRecordedVideo={handleDownloadRecordedVideo}
                      onStartRecording={startRecording}
                      onStopRecording={stopRecorder}
                      onUploadVideo={handleUpload}
                      recordingSeconds={recordingSeconds}
                    />
                    <Text fontSize="xs" color="gray.500">
                      {hasActiveShare
                        ? "Game window connected. You can start/stop recording without selecting the window again."
                        : "Use Connect Game Window in the preview column before recording."}
                    </Text>
                  </Stack>
                </Box>
              </Stack>
            </Box>

            {isProcessing && (
              <ProcessingPanel current={progress.current} total={progress.total} label="Analyzing video frames..." />
            )}
            <ResultPanel resultImage={resultImage} isProcessing={isProcessing} onClear={handleReset} />
          </Stack>

          <PreviewSidebar
            hasActiveShare={hasActiveShare}
            isConnectedPreviewVisible={isConnectedPreviewVisible}
            isConnecting={isConnecting}
            isProcessing={isProcessing}
            isRecording={isRecording}
            onToggleConnection={handleShareButtonClick}
            previewVideoRef={sidebarPreviewVideoRef}
          />
        </Stack>
      </Box>

      <SettingsDialog
        isAutoStopEnabled={isAutoStopEnabled}
        isConnectedPreviewVisible={isConnectedPreviewVisible}
        isOpen={isSettingsOpen}
        onAutoStopChange={setIsAutoStopEnabled}
        onConnectedPreviewChange={setIsConnectedPreviewVisible}
        onOpenChange={setIsSettingsOpen}
      />
    </Box>
  )
}

export default MemoryGame
