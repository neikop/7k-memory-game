import { Box, Button, HStack, Icon, Image, Progress, Stack, Text } from "@chakra-ui/react"
import { FiX } from "react-icons/fi"

type ResultPanelProps = {
  resultImage: string | null
  processingCurrent: number
  processingTotal: number
  isProcessing: boolean
  onClear: () => void
}

const ResultPanel = ({ resultImage, processingCurrent, processingTotal, isProcessing, onClear }: ResultPanelProps) => {
  const progressValue = processingTotal > 0 ? Math.round((processingCurrent / processingTotal) * 100) : 0

  return (
    <Box borderWidth="1px" borderColor="gray.200" bg="whiteAlpha.900" borderRadius="3xl" p={4} shadow="sm">
      <Stack gap={3}>
        <HStack justify="space-between" align="flex-start" gap={2}>
          <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" letterSpacing="widest" color="gray.500">
            Generated Solution
          </Text>
          {resultImage && (
            <Button onClick={onClear} size="sm" variant="outline" rounded="full">
              <HStack as="span" gap={1}>
                <Icon as={FiX} boxSize={4} />
                <span>Clear</span>
              </HStack>
            </Button>
          )}
        </HStack>

        {isProcessing && (
          <Box borderWidth="1px" borderColor="blue.100" bg="blue.50" borderRadius="2xl" p={3}>
            <Stack gap={2}>
              <HStack justify="space-between" gap={2}>
                <Text fontSize="sm" fontWeight="medium" color="gray.700">
                  Processing Frames
                </Text>
                <Text fontSize="xs" fontWeight="semibold" color="blue.700">
                  {progressValue}%
                </Text>
              </HStack>
              <Progress.Root value={progressValue} colorPalette="blue" size="sm">
                <Progress.Track>
                  <Progress.Range />
                </Progress.Track>
              </Progress.Root>
              <Text fontSize="xs" color="gray.600">
                Frame {processingCurrent} / {processingTotal}
              </Text>
            </Stack>
          </Box>
        )}

        {resultImage ? (
          <Box overflow="hidden" borderWidth="1px" borderColor="gray.200" borderRadius="2xl" bg="gray.50" p={1}>
            <Image
              src={resultImage}
              alt="Merged memory-game solution"
              w="full"
              borderWidth="1px"
              borderColor="gray.200"
              borderRadius="xl"
            />
          </Box>
        ) : (
          !isProcessing && (
            <Box
              borderWidth="1px"
              borderStyle="dashed"
              borderColor="gray.300"
              borderRadius="2xl"
              p={4}
              textAlign="center"
            >
              <Text fontSize="sm" fontWeight="medium" color="gray.500">
                Your generated solution image will appear here after recording is processed.
              </Text>
            </Box>
          )
        )}
      </Stack>
    </Box>
  )
}

export default ResultPanel
