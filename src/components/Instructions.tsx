import { Box, Heading, Text, VStack } from "@chakra-ui/react"

const steps = [
  "Open the Seven Knights memory game screen, then keep it fully visible while recording.",
  "Click Start Screen Recording and select the game window.",
  "Flip all cards in the game until every face has appeared at least once.",
  "Click Stop Recording, then wait for frame analysis to complete.",
  "Download the generated image and use it as your quick reference.",
]

const Instructions = () => {
  return (
    <Box borderWidth="1px" borderColor="gray.200" bg="white" borderRadius="3xl" p={{ base: 5, md: 6 }} shadow="sm">
      <Heading size="md" color="gray.900">
        How It Works
      </Heading>
      <Text mt={1} fontSize="sm" color="gray.600">
        Follow this flow for the most accurate merged result.
      </Text>

      <VStack mt={4} gap={3} align="stretch">
        {steps.map((step, index) => (
          <Box key={step} borderWidth="1px" borderColor="gray.200" borderRadius="xl" bg="gray.50" p={3}>
            <Text fontSize="sm" color="gray.700">
              <Text as="span" fontWeight="semibold">
                {index + 1}.
              </Text>{" "}
              {step}
            </Text>
          </Box>
        ))}
      </VStack>

      <Box mt={4} borderWidth="1px" borderColor="gray.200" borderRadius="2xl" bg="gray.50" p={4}>
        <Text fontSize="xs" fontWeight="semibold" letterSpacing="widest" textTransform="uppercase" color="gray.500">
          Tip
        </Text>
        <Text mt={2} fontSize="sm" color="gray.600">
          Keep the game window stable and avoid overlapping popups while flipping cards for the best reconstruction
          quality.
        </Text>
      </Box>
    </Box>
  )
}

export default Instructions
