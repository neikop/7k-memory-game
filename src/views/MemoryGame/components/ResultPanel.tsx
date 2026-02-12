import { Box, Button, Heading, Image, Stack, Text } from "@chakra-ui/react"

type ResultPanelProps = {
  resultImage: string | null
  isProcessing: boolean
  onClear: () => void
}

const ResultPanel = ({ resultImage, isProcessing, onClear }: ResultPanelProps) => {
  if (!resultImage) {
    return (
      <Box
        borderWidth="1px"
        borderStyle="dashed"
        borderColor="gray.300"
        bg="whiteAlpha.800"
        borderRadius="3xl"
        p={4}
        textAlign="center"
      >
        <Text fontSize="sm" fontWeight="medium" color="gray.500">
          Your generated solution image will appear here after recording is processed.
        </Text>
      </Box>
    )
  }

  return (
    <Box borderWidth="1px" borderColor="gray.200" bg="white" borderRadius="3xl" p={4} shadow="sm">
      <Stack gap={3}>
        <Stack
          direction={{ base: "column", sm: "row" }}
          align={{ base: "stretch", sm: "center" }}
          justify="space-between"
          gap={2}
        >
          <Heading size="md" color="gray.900">
            Generated Solution
          </Heading>
          <Button
            onClick={onClear}
            disabled={isProcessing}
            size="sm"
            variant="outline"
            alignSelf={{ base: "flex-start", sm: "auto" }}
          >
            Clear
          </Button>
        </Stack>
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
      </Stack>
    </Box>
  )
}

export default ResultPanel
