import { Badge, Box, Button, Heading, HStack, Image, Input, Link, Stack, Text } from "@chakra-ui/react"
import { type ChangeEvent, useRef, useState } from "react"
import Instructions from "components/Instructions"
import ProgressBar from "components/ProgressBar"
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

const MemoryGame = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 0 })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      })

      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" })
        void processVideo(blob)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      alert(`Recording failed: ${getErrorMessage(error)}`)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleReset = () => {
    setResultImage(null)
    setProgress({ current: 0, total: 0 })
    setIsProcessing(false)
  }

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
      <Box maxW="5xl" mx="auto" px={{ base: 4, md: 6, lg: 8 }} py={8}>
        <Box
          mb={6}
          borderWidth="1px"
          borderColor="gray.200"
          bg="whiteAlpha.900"
          borderRadius="3xl"
          p={{ base: 5, md: 8 }}
          shadow="sm"
        >
          <Stack
            mb={4}
            gap={3}
            direction={{ base: "column", sm: "row" }}
            align={{ base: "stretch", sm: "center" }}
            justify="space-between"
          >
            <Box>
              <Text
                fontSize="xs"
                fontWeight="semibold"
                textTransform="uppercase"
                letterSpacing="widest"
                color="gray.500"
              >
                Seven Knights Tool
              </Text>
              <Heading mt={2} size={{ base: "xl", md: "2xl" }} color="gray.900">
                Memory Game Solver
              </Heading>
              <Text mt={2} maxW="2xl" fontSize="sm" color="gray.600">
                Record your game, process the frames, and export one merged image with revealed cards.
              </Text>
            </Box>
            <Badge
              alignSelf="start"
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
          </Stack>

          <Box borderWidth="1px" borderColor="gray.200" bg="gray.50" borderRadius="2xl" p={4}>
            <HStack gap={3} align="center" flexWrap="wrap">
              {UI_CONFIG.showUploadButton && (
                <>
                  <Input type="file" accept="video/*" ref={fileInputRef} onChange={handleUpload} display="none" />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing || isRecording}
                    size="sm"
                    variant="outline"
                    colorPalette="blue"
                  >
                    Upload Video
                  </Button>
                </>
              )}

              {!isRecording ? (
                <Button onClick={startRecording} disabled={isProcessing} size="sm" colorPalette="red">
                  Start Screen Recording
                </Button>
              ) : (
                <Button onClick={stopRecording} size="sm" colorPalette="red">
                  Stop Recording
                </Button>
              )}

              <Button onClick={handleReset} disabled={isProcessing} size="sm" variant="outline">
                Clear Result
              </Button>
            </HStack>
          </Box>
        </Box>

        <Instructions />

        {isProcessing && (
          <ProgressBar current={progress.current} total={progress.total} label="Analyzing video frames..." />
        )}

        {resultImage ? (
          <Box
            mt={6}
            borderWidth="1px"
            borderColor="gray.200"
            bg="white"
            borderRadius="3xl"
            p={{ base: 5, md: 6 }}
            shadow="sm"
          >
            <HStack mb={4} align="center" justify="space-between" gap={3} flexWrap="wrap">
              <Heading size="md" color="gray.900">
                Generated Solution
              </Heading>
              <Link href={resultImage} download="memory-game-solution.png" _hover={{ textDecoration: "none" }}>
                <Button size="sm" colorPalette="green">
                  Download PNG
                </Button>
              </Link>
            </HStack>
            <Box overflow="hidden" borderWidth="1px" borderColor="gray.200" borderRadius="2xl" bg="gray.50" p={2}>
              <Image
                src={resultImage}
                alt="Merged memory-game solution"
                w="full"
                borderWidth="1px"
                borderColor="gray.200"
                borderRadius="xl"
              />
            </Box>
          </Box>
        ) : (
          <Box
            mt={6}
            borderWidth="1px"
            borderStyle="dashed"
            borderColor="gray.300"
            bg="whiteAlpha.800"
            borderRadius="3xl"
            p={8}
            textAlign="center"
          >
            <Text fontSize="sm" fontWeight="medium" color="gray.500">
              Your generated solution image will appear here after recording is processed.
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default MemoryGame
