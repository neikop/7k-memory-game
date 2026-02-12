import { Box, Button, Heading, Icon, Stack, Text } from "@chakra-ui/react"
import { type ChangeEvent, useCallback, useRef, useState } from "react"
import { FiSettings } from "react-icons/fi"
import PreviewSidebar from "./components/PreviewSidebar"
import RecordingActions from "./components/RecordingActions"
import ResultPanel from "./components/ResultPanel"
import SettingsDialog from "./components/SettingsDialog"
import useRecordingController from "./hooks/useRecordingController"
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

const MemoryGame = () => {
  const [isAutoStopEnabled, setIsAutoStopEnabled] = useState(true)
  const [isConnectedPreviewVisible, setIsConnectedPreviewVisible] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 0 })
  const [resultImage, setResultImage] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const processVideo = useCallback(async (blob: Blob) => {
    setIsProcessing(true)
    setProgress({ current: 0, total: 0 })
    setResultImage(null)

    try {
      const result = await processVideoToImage(blob, (current, total) => {
        setProgress({ current, total })
      })
      setResultImage(result)
    } catch (error) {
      console.error("Processing error:", error)
      alert(`Processing failed: ${getErrorMessage(error)}`)
    } finally {
      setIsProcessing(false)
    }
  }, [])

  const handleRecordedBlob = useCallback(
    (blob: Blob) => {
      void processVideo(blob)
    },
    [processVideo],
  )

  const handleUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) {
        void processVideo(file)
      }

      // Allow selecting the same file again.
      event.target.value = ""
    },
    [processVideo],
  )

  const {
    downloadRecordedVideo,
    hasActiveShare,
    hiddenPreviewVideoRef,
    isConnecting,
    isRecording,
    recordedVideoUrl,
    recordingSeconds,
    sidebarPreviewVideoRef,
    startRecording,
    stopRecording,
    toggleShareConnection,
  } = useRecordingController({
    autoStopEnabled: isAutoStopEnabled,
    onRecordedBlob: handleRecordedBlob,
  })

  const handleReset = useCallback(() => {
    setResultImage(null)
    setProgress({ current: 0, total: 0 })
    setIsProcessing(false)
  }, [])

  return (
    <Box minH="100vh" bgGradient="linear(to-br, gray.100, white, blue.50)">
      <Box w="full" display="flex" justifyContent="center" px={4} py={4}>
        <Box w="full" maxW={{ base: "full", lg: "calc(100vw - 32px)", "2xl": "2440px" }}>
          <Stack
            w="full"
            direction={{ base: "column", lg: "row" }}
            align="stretch"
            justify={{ base: "flex-start", lg: "center" }}
            gap={4}
          >
            <Stack flex="1" minW={0} w="full" maxW={{ base: "full", lg: "1100px", "2xl": "1280px" }} gap={4}>
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
                  <Stack gap={1} pr={10}>
                    <Text
                      fontSize="xs"
                      fontWeight="semibold"
                      textTransform="uppercase"
                      letterSpacing="widest"
                      color="gray.500"
                    >
                      Memory Solver
                    </Text>
                    <Heading size={{ base: "lg", md: "xl" }} color="gray.900">
                      Seven Knights Re:BIRTH - Memory Game
                    </Heading>
                  </Stack>

                  <Box borderWidth="1px" borderColor="gray.200" bg="gray.50" borderRadius="2xl" px={4} py={3}>
                    <Stack gap={2}>
                      <RecordingActions
                        canDownload={Boolean(recordedVideoUrl)}
                        fileInputRef={fileInputRef}
                        hasActiveShare={hasActiveShare}
                        isConnecting={isConnecting}
                        isProcessing={isProcessing}
                        isRecording={isRecording}
                        onDownloadRecordedVideo={downloadRecordedVideo}
                        onStartRecording={startRecording}
                        onStopRecording={stopRecording}
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

              <ResultPanel
                resultImage={resultImage}
                processingCurrent={progress.current}
                processingTotal={progress.total}
                isProcessing={isProcessing}
                onClear={handleReset}
              />
            </Stack>

            <PreviewSidebar
              hasActiveShare={hasActiveShare}
              isConnectedPreviewVisible={isConnectedPreviewVisible}
              isConnecting={isConnecting}
              isProcessing={isProcessing}
              isRecording={isRecording}
              onToggleConnection={toggleShareConnection}
              previewVideoRef={sidebarPreviewVideoRef}
            />
          </Stack>
        </Box>
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
