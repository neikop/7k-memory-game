import { Badge, Box, Button, Heading, HStack, Icon, Input, Stack, Text } from "@chakra-ui/react"
import { type ChangeEvent, useEffect, useRef, useState } from "react"
import { FiMonitor, FiPlay, FiSquare, FiUpload } from "react-icons/fi"
import ProcessingPanel from "./components/ProcessingPanel"
import ResultPanel from "./components/ResultPanel"
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

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
}

const MemoryGame = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [hasActiveShare, setHasActiveShare] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 0 })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const previewVideoRef = useRef<HTMLVideoElement | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const attachPreviewStream = async (stream: MediaStream | null) => {
    const previewVideo = previewVideoRef.current
    if (!previewVideo) {
      return
    }

    previewVideo.srcObject = stream

    if (stream) {
      try {
        await previewVideo.play()
      } catch {
        // Ignore autoplay rejections. This hidden preview is only to keep capture stream active.
      }
    }
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

  const stopRecordingStream = () => {
    if (!recordingStreamRef.current) {
      return
    }

    recordingStreamRef.current.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
    mediaRecorderRef.current = null
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
          setIsRecording(false)
          setRecordingSeconds(0)
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop()
          }
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

      const mediaRecorder = new MediaRecorder(recordingStream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        stopRecordingStream()
        const blob = new Blob(chunksRef.current, { type: "video/webm" })
        chunksRef.current = []
        if (blob.size > 0) {
          void processVideo(blob)
        }
      }

      mediaRecorder.start()
      setRecordingSeconds(0)
      setIsRecording(true)
    } catch (error) {
      alert(`Recording failed: ${getErrorMessage(error)}`)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleReset = () => {
    setResultImage(null)
    setProgress({ current: 0, total: 0 })
    setIsProcessing(false)
  }

  const disconnectShare = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
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
    const previewVideo = previewVideoRef.current

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop()
      }
      setRecordingSeconds(0)
      stopRecordingStream()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (previewVideo) {
        previewVideo.srcObject = null
      }
    }
  }, [])

  const statusLabel = isProcessing ? "Processing Frames" : isRecording ? "Recording" : resultImage ? "Solved" : "Ready"
  const statusStyle = isProcessing
    ? { bg: "blue.50", color: "blue.700", borderColor: "blue.200" }
    : isRecording
      ? { bg: "red.50", color: "red.700", borderColor: "red.200" }
      : resultImage
        ? { bg: "green.50", color: "green.700", borderColor: "green.200" }
        : { bg: "gray.100", color: "gray.700", borderColor: "gray.200" }

  return (
    <Box minH="100vh" bgGradient="linear(to-br, gray.100, white, blue.50)">
      <Box w="full" display="flex" justifyContent="center" px={4} py={4}>
        <Stack w="full" maxW="5xl" gap={4}>
          <video
            ref={previewVideoRef}
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
          <Box borderWidth="1px" borderColor="gray.200" bg="whiteAlpha.900" borderRadius="3xl" p={4} shadow="sm">
            <Stack gap={4}>
              <Stack gap={2}>
                <Text
                  fontSize="xs"
                  fontWeight="semibold"
                  textTransform="uppercase"
                  letterSpacing="widest"
                  color="gray.500"
                >
                  Seven Knights Tool
                </Text>
                <Heading size={{ base: "xl", md: "2xl" }} color="gray.900">
                  Memory Game Solver
                </Heading>
                <Text maxW="2xl" fontSize="sm" color="gray.600">
                  Record your game and process the frames into one merged image with revealed cards.
                </Text>
              </Stack>

              <Box borderWidth="1px" borderColor="gray.200" bg="gray.50" borderRadius="2xl" px={4} py={3}>
                <Stack gap={2}>
                  <HStack w="full" gap={2} align="center" justify="space-between">
                    {!isRecording ? (
                      <Button
                        onClick={startRecording}
                        disabled={isProcessing || !hasActiveShare || isConnecting}
                        size="sm"
                        colorPalette="red"
                      >
                        <HStack as="span" gap={1}>
                          <Icon as={FiPlay} boxSize={4} />
                          <span>Start Recording</span>
                        </HStack>
                      </Button>
                    ) : (
                      <Button onClick={stopRecording} size="sm" colorPalette="red">
                        <HStack as="span" gap={1}>
                          <Icon as={FiSquare} boxSize={4} />
                          <span>Stop Recording</span>
                        </HStack>
                      </Button>
                    )}

                    <HStack gap={2} align="center">
                      <Button
                        onClick={handleShareButtonClick}
                        disabled={isProcessing || isRecording || isConnecting}
                        size="sm"
                        variant={hasActiveShare ? "outline" : "solid"}
                        colorPalette={hasActiveShare ? "orange" : "blue"}
                      >
                        <HStack as="span" gap={1}>
                          <Icon as={FiMonitor} boxSize={4} />
                          <span>
                            {isConnecting
                              ? "Connecting..."
                              : hasActiveShare
                                ? "Disconnect Game Window"
                                : "Connect Game Window"}
                          </span>
                        </HStack>
                      </Button>
                      {UI_CONFIG.showUploadButton && (
                        <>
                          <Input
                            type="file"
                            accept="video/*"
                            ref={fileInputRef}
                            onChange={handleUpload}
                            display="none"
                          />
                          <Button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isProcessing || isRecording}
                            size="sm"
                            variant="outline"
                            colorPalette="blue"
                          >
                            <HStack as="span" gap={1}>
                              <Icon as={FiUpload} boxSize={4} />
                              <span>Upload Video</span>
                            </HStack>
                          </Button>
                        </>
                      )}
                    </HStack>
                  </HStack>
                  <Text fontSize="xs" color="gray.500">
                    {hasActiveShare
                      ? "Game window connected. You can start/stop recording without selecting the window again."
                      : "Click Connect Game Window to choose a window and grant permission first."}
                  </Text>
                  <HStack gap={2} align="center" flexWrap="wrap">
                    <Badge
                      borderWidth="1px"
                      borderRadius="full"
                      px={3}
                      py={1}
                      fontSize="xs"
                      fontWeight="semibold"
                      {...statusStyle}
                    >
                      {statusLabel}
                    </Badge>
                    {isRecording && (
                      <Text fontSize="sm" fontWeight="semibold" color="red.600">
                        Recording: {formatDuration(recordingSeconds)}
                      </Text>
                    )}
                  </HStack>
                </Stack>
              </Box>
            </Stack>
          </Box>

          {isProcessing && (
            <ProcessingPanel current={progress.current} total={progress.total} label="Analyzing video frames..." />
          )}
          <ResultPanel resultImage={resultImage} isProcessing={isProcessing} onClear={handleReset} />
        </Stack>
      </Box>
    </Box>
  )
}

export default MemoryGame
