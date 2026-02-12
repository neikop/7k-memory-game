import { Box, Button, HStack, Icon, Stack, Text } from "@chakra-ui/react"
import { type RefObject } from "react"
import { FiMonitor } from "react-icons/fi"

type PreviewSidebarProps = {
  hasActiveShare: boolean
  isConnectedPreviewVisible: boolean
  isConnecting: boolean
  isProcessing: boolean
  isRecording: boolean
  onToggleConnection: () => void
  previewVideoRef: RefObject<HTMLVideoElement | null>
}

const PreviewSidebar = ({
  hasActiveShare,
  isConnectedPreviewVisible,
  isConnecting,
  isProcessing,
  isRecording,
  onToggleConnection,
  previewVideoRef,
}: PreviewSidebarProps) => {
  const connectLabel = isConnecting
    ? "Connecting..."
    : hasActiveShare
      ? "Disconnect Game Window"
      : "Connect Game Window"

  const helperMessage = !hasActiveShare
    ? "Connect a game window to start preview."
    : !isConnectedPreviewVisible
      ? "Preview hidden in settings."
      : "Live connected stream."

  return (
    <Box
      w={{ base: "full", lg: "360px" }}
      h="fit-content"
      maxW="600px"
      flexShrink={0}
      borderWidth="1px"
      borderColor="gray.200"
      bg="whiteAlpha.900"
      borderRadius="3xl"
      p={4}
      shadow="sm"
      css={{
        "@media (min-width: 1920px)": {
          width: "480px",
        },
        "@media (min-width: 2560px)": {
          width: "600px",
        },
      }}
    >
      <Stack gap={3}>
        <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" letterSpacing="widest" color="gray.500">
          Stream Preview
        </Text>

        <Button
          onClick={onToggleConnection}
          disabled={isProcessing || isRecording || isConnecting}
          size="sm"
          variant={hasActiveShare ? "outline" : "solid"}
          colorPalette={hasActiveShare ? "orange" : "blue"}
        >
          <HStack as="span" gap={1}>
            <Icon as={FiMonitor} boxSize={4} />
            <span>{connectLabel}</span>
          </HStack>
        </Button>

        <Box
          position="relative"
          w="full"
          aspectRatio="16 / 9"
          overflow="hidden"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="xl"
          bg="black"
        >
          <video
            ref={previewVideoRef}
            muted
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
              opacity: isConnectedPreviewVisible ? 1 : 0,
            }}
          />
          {(!hasActiveShare || !isConnectedPreviewVisible) && (
            <Box
              position="absolute"
              inset={0}
              display="flex"
              alignItems="center"
              justifyContent="center"
              px={4}
              textAlign="center"
              bg="blackAlpha.700"
            >
              <Text fontSize="xs" fontWeight="semibold" color="gray.300">
                {helperMessage}
              </Text>
            </Box>
          )}
        </Box>
      </Stack>
    </Box>
  )
}

export default PreviewSidebar
