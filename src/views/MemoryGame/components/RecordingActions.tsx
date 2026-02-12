import { Box, Button, HStack, Icon, Input, Tooltip } from "@chakra-ui/react"
import { type ChangeEvent, type RefObject } from "react"
import { FiDownload, FiPlay, FiSquare, FiUpload } from "react-icons/fi"

type RecordingActionsProps = {
  canDownload: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  hasActiveShare: boolean
  isConnecting: boolean
  isProcessing: boolean
  isRecording: boolean
  onDownloadRecordedVideo: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onUploadVideo: (event: ChangeEvent<HTMLInputElement>) => void
  recordingSeconds: number
}

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
}

const RecordingActions = ({
  canDownload,
  fileInputRef,
  hasActiveShare,
  isConnecting,
  isProcessing,
  isRecording,
  onDownloadRecordedVideo,
  onStartRecording,
  onStopRecording,
  onUploadVideo,
  recordingSeconds,
}: RecordingActionsProps) => {
  return (
    <HStack w="full" gap={2} align="center">
      <HStack gap={2} align="center" flex="1" minW={0}>
        {!isRecording ? (
          <Button
            onClick={onStartRecording}
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
          <Button onClick={onStopRecording} size="sm" colorPalette="red">
            <HStack as="span" gap={1}>
              <Icon as={FiSquare} boxSize={4} />
              <span>Stop Recording ({formatDuration(recordingSeconds)})</span>
            </HStack>
          </Button>
        )}

        <Tooltip.Root positioning={{ placement: "bottom" }}>
          <Tooltip.Trigger asChild>
            <Box as="span" display="inline-flex">
              <Button
                aria-label="Download recorded video"
                onClick={onDownloadRecordedVideo}
                disabled={!canDownload || isRecording}
                size="sm"
                variant="outline"
                colorPalette="green"
                minW="8"
                px={0}
              >
                <Icon as={FiDownload} boxSize={4} />
              </Button>
            </Box>
          </Tooltip.Trigger>
          <Tooltip.Positioner>
            <Tooltip.Content>Download recorded video</Tooltip.Content>
          </Tooltip.Positioner>
        </Tooltip.Root>
      </HStack>

      <Input type="file" accept="video/*" ref={fileInputRef} onChange={onUploadVideo} display="none" />
      <Button
        onClick={() => fileInputRef.current?.click()}
        disabled={isProcessing || isRecording}
        size="sm"
        variant="outline"
        colorPalette="blue"
        ml="auto"
      >
        <HStack as="span" gap={1}>
          <Icon as={FiUpload} boxSize={4} />
          <span>Upload Video</span>
        </HStack>
      </Button>
    </HStack>
  )
}

export default RecordingActions
