import { Box, HStack, Text } from "@chakra-ui/react"

type ProgressBarProps = {
  current: number
  total: number
  label?: string
}

const ProgressBar = ({ current, total, label }: ProgressBarProps) => {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <Box mb={6} w="full" borderWidth="1px" borderColor="blue.100" bg="white" borderRadius="2xl" p={4} shadow="sm">
      <HStack mb={3} justify="space-between" gap={3}>
        <Text fontSize="sm" fontWeight="medium" color="gray.700">
          {label ?? "Processing..."}
        </Text>
        <Text fontSize="xs" fontWeight="semibold" color="blue.700">
          {percentage}%
        </Text>
      </HStack>
      <Box h="3" w="full" overflow="hidden" borderRadius="full" bg="blue.100">
        <Box
          h="full"
          borderRadius="full"
          bgGradient="linear(to-r, blue.500, purple.500)"
          transition="width 0.3s ease"
          style={{ width: `${percentage}%` }}
        />
      </Box>
      <Text mt={2} fontSize="xs" color="gray.500">
        Frame {current} / {total}
      </Text>
    </Box>
  )
}

export default ProgressBar
