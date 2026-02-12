import { Box, HStack, Progress, Stack, Text } from "@chakra-ui/react"

type ProcessingPanelProps = {
  current: number
  total: number
  label?: string
}

const ProcessingPanel = ({ current, total, label }: ProcessingPanelProps) => {
  const value = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <Box w="full" borderWidth="1px" borderColor="blue.100" bg="white" borderRadius="2xl" p={2} shadow="sm">
      <Stack gap={2}>
        <HStack justify="space-between" gap={2}>
          <Text fontSize="sm" fontWeight="medium" color="gray.700">
            {label ?? "Processing..."}
          </Text>
          <Text fontSize="xs" fontWeight="semibold" color="blue.700">
            {value}%
          </Text>
        </HStack>
        <Progress.Root value={value} colorPalette="blue" size="sm">
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
        <Text fontSize="xs" color="gray.500">
          Frame {current} / {total}
        </Text>
      </Stack>
    </Box>
  )
}

export default ProcessingPanel
