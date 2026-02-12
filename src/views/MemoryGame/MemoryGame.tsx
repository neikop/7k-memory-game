import { Box, Button, Heading, Icon, Stack, Text, Tooltip } from "@chakra-ui/react"
import { toaster } from "components/ui/toaster"
import { type ChangeEvent, useCallback, useRef, useState } from "react"
import { FiSettings } from "react-icons/fi"
import { PreviewSidebar, RecordingActions, ResultPanel, SettingsDialog } from "./components"
import { useRecordingController, useVideoProcessing } from "./hooks"

const MemoryGame = () => {
  const [isAutoStopEnabled, setIsAutoStopEnabled] = useState(true)
  const [isConnectedPreviewVisible, setIsConnectedPreviewVisible] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const showError = useCallback((error: ErrorNotice) => {
    toaster.create({
      description: error.description,
      title: error.title,
      type: "error",
    })
  }, [])

  const { clearResult, isProcessing, processVideo, progress, resultImage } = useVideoProcessing({
    onError: showError,
  })

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
    onError: showError,
    onRecordedBlob: handleRecordedBlob,
  })

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
                <Tooltip.Root positioning={{ placement: "left" }}>
                  <Tooltip.Trigger asChild>
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
                  </Tooltip.Trigger>
                  <Tooltip.Positioner>
                    <Tooltip.Content>Settings</Tooltip.Content>
                  </Tooltip.Positioner>
                </Tooltip.Root>

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
                onClear={clearResult}
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
