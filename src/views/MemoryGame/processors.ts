import { PROCESSING_CONFIG } from "./config"

type ProgressCallback = (current: number, total: number) => void

type ProcessingContext = {
  video: HTMLVideoElement
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  frameCount: number
  objectUrl: string
}

type PixelChannels = {
  r: number[]
  g: number[]
  b: number[]
}

const loadVideoMetadata = (video: HTMLVideoElement, source: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const handleLoaded = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error("Unable to load video metadata"))
    }
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", handleLoaded)
      video.removeEventListener("error", handleError)
    }

    video.addEventListener("loadedmetadata", handleLoaded, { once: true })
    video.addEventListener("error", handleError, { once: true })
    video.src = source
  })
}

const setVideoTime = (video: HTMLVideoElement, requestedTime: number): Promise<void> => {
  const maxTime = Number.isFinite(video.duration) ? Math.max(video.duration - 0.001, 0) : 0
  const targetTime = Math.min(Math.max(requestedTime, 0), maxTime)
  if (Math.abs(video.currentTime - targetTime) < 0.001) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const handleSeeked = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error("Unable to seek video frame"))
    }
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked)
      video.removeEventListener("error", handleError)
    }

    video.addEventListener("seeked", handleSeeked, { once: true })
    video.addEventListener("error", handleError, { once: true })
    video.currentTime = targetTime
  })
}

const createProcessingContext = async (blob: Blob): Promise<ProcessingContext> => {
  const video = document.createElement("video")
  const objectUrl = URL.createObjectURL(blob)
  await loadVideoMetadata(video, objectUrl)
  await setVideoTime(video, 0)

  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Canvas 2D context is not available")
  }

  canvas.width = Math.max(1, Math.floor(video.videoWidth * PROCESSING_CONFIG.scaleDown))
  canvas.height = Math.max(1, Math.floor(video.videoHeight * PROCESSING_CONFIG.scaleDown))

  const frameCount = Math.max(1, Math.floor(video.duration * PROCESSING_CONFIG.fps))

  return { video, canvas, ctx, frameCount, objectUrl }
}

const drawCurrentFrame = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

const getBaselineData = async (video: HTMLVideoElement, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
  await setVideoTime(video, video.duration - 0.1)
  return drawCurrentFrame(ctx, canvas, video)
}

const copyImageData = (source: ImageData, target: ImageData) => {
  for (let index = 0; index < source.data.length; index += 1) {
    target.data[index] = source.data[index]
  }
}

const getPixelDifference = (currentData: Uint8ClampedArray, baseData: Uint8ClampedArray, offset: number) => {
  const rDiff = Math.abs(currentData[offset] - baseData[offset])
  const gDiff = Math.abs(currentData[offset + 1] - baseData[offset + 1])
  const bDiff = Math.abs(currentData[offset + 2] - baseData[offset + 2])
  return (rDiff + gDiff + bDiff) / 3
}

const getPixelBrightness = (data: Uint8ClampedArray, offset: number) => {
  return (data[offset] + data[offset + 1] + data[offset + 2]) / 3
}

const reportProgress = (index: number, frameCount: number, onProgress?: ProgressCallback) => {
  if (index % PROCESSING_CONFIG.progressUpdateInterval === 0 || index === frameCount - 1) {
    onProgress?.(index + 1, frameCount)
  }
}

const finalizeResult = (ctx: CanvasRenderingContext2D, result: ImageData): string => {
  ctx.putImageData(result, 0, 0)
  return ctx.canvas.toDataURL("image/png")
}

export const processVideoChangedPixelsLastValue = async (
  blob: Blob,
  onProgress?: ProgressCallback,
): Promise<string> => {
  const context = await createProcessingContext(blob)
  const { video, canvas, ctx, frameCount, objectUrl } = context

  try {
    const baselineData = await getBaselineData(video, ctx, canvas)
    const result = ctx.createImageData(canvas.width, canvas.height)
    copyImageData(baselineData, result)

    const pixelCount = canvas.width * canvas.height

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      await setVideoTime(video, frameIndex / PROCESSING_CONFIG.fps)
      const currentData = drawCurrentFrame(ctx, canvas, video)

      for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        const offset = pixelIndex * 4
        const totalDiff = getPixelDifference(currentData.data, baselineData.data, offset)

        if (totalDiff > PROCESSING_CONFIG.threshold) {
          result.data[offset] = currentData.data[offset]
          result.data[offset + 1] = currentData.data[offset + 1]
          result.data[offset + 2] = currentData.data[offset + 2]
          result.data[offset + 3] = 255
        }
      }

      reportProgress(frameIndex, frameCount, onProgress)
    }

    return finalizeResult(ctx, result)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export const processVideoMaxDifference = async (blob: Blob, onProgress?: ProgressCallback): Promise<string> => {
  const context = await createProcessingContext(blob)
  const { video, canvas, ctx, frameCount, objectUrl } = context

  try {
    const baselineData = await getBaselineData(video, ctx, canvas)
    const result = ctx.createImageData(canvas.width, canvas.height)
    copyImageData(baselineData, result)

    const pixelCount = canvas.width * canvas.height
    const maxDifference = new Float32Array(pixelCount)

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      await setVideoTime(video, frameIndex / PROCESSING_CONFIG.fps)
      const currentData = drawCurrentFrame(ctx, canvas, video)

      for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        const offset = pixelIndex * 4
        const totalDiff = getPixelDifference(currentData.data, baselineData.data, offset)

        if (totalDiff > PROCESSING_CONFIG.threshold && totalDiff > maxDifference[pixelIndex]) {
          maxDifference[pixelIndex] = totalDiff
          result.data[offset] = currentData.data[offset]
          result.data[offset + 1] = currentData.data[offset + 1]
          result.data[offset + 2] = currentData.data[offset + 2]
          result.data[offset + 3] = 255
        }
      }

      reportProgress(frameIndex, frameCount, onProgress)
    }

    return finalizeResult(ctx, result)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export const processVideoMedian = async (blob: Blob, onProgress?: ProgressCallback): Promise<string> => {
  const context = await createProcessingContext(blob)
  const { video, canvas, ctx, frameCount, objectUrl } = context

  try {
    const baselineData = await getBaselineData(video, ctx, canvas)
    const pixelCount = canvas.width * canvas.height
    const pixelValues: PixelChannels[] = Array.from({ length: pixelCount }, () => ({
      r: [],
      g: [],
      b: [],
    }))

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      await setVideoTime(video, frameIndex / PROCESSING_CONFIG.fps)
      const currentData = drawCurrentFrame(ctx, canvas, video)

      for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        const offset = pixelIndex * 4
        const totalDiff = getPixelDifference(currentData.data, baselineData.data, offset)
        if (totalDiff > PROCESSING_CONFIG.threshold) {
          pixelValues[pixelIndex].r.push(currentData.data[offset])
          pixelValues[pixelIndex].g.push(currentData.data[offset + 1])
          pixelValues[pixelIndex].b.push(currentData.data[offset + 2])
        }
      }

      reportProgress(frameIndex, frameCount, onProgress)
    }

    const result = ctx.createImageData(canvas.width, canvas.height)
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      const offset = pixelIndex * 4
      const { r, g, b } = pixelValues[pixelIndex]

      if (r.length > 0) {
        r.sort((first, second) => first - second)
        g.sort((first, second) => first - second)
        b.sort((first, second) => first - second)

        const midpoint = Math.floor(r.length / 2)
        result.data[offset] = r[midpoint]
        result.data[offset + 1] = g[midpoint]
        result.data[offset + 2] = b[midpoint]
      } else {
        result.data[offset] = baselineData.data[offset]
        result.data[offset + 1] = baselineData.data[offset + 1]
        result.data[offset + 2] = baselineData.data[offset + 2]
      }
      result.data[offset + 3] = 255
    }

    return finalizeResult(ctx, result)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export const processVideoMaxBrightness = async (blob: Blob, onProgress?: ProgressCallback): Promise<string> => {
  const context = await createProcessingContext(blob)
  const { video, canvas, ctx, frameCount, objectUrl } = context

  try {
    const baselineData = await getBaselineData(video, ctx, canvas)
    const result = ctx.createImageData(canvas.width, canvas.height)
    copyImageData(baselineData, result)

    const pixelCount = canvas.width * canvas.height
    const maxBrightness = new Float32Array(pixelCount)
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      maxBrightness[pixelIndex] = getPixelBrightness(baselineData.data, pixelIndex * 4)
    }

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      await setVideoTime(video, frameIndex / PROCESSING_CONFIG.fps)
      const currentData = drawCurrentFrame(ctx, canvas, video)

      for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        const offset = pixelIndex * 4
        const totalDiff = getPixelDifference(currentData.data, baselineData.data, offset)
        if (totalDiff > PROCESSING_CONFIG.threshold) {
          const brightness = getPixelBrightness(currentData.data, offset)
          if (brightness > maxBrightness[pixelIndex]) {
            maxBrightness[pixelIndex] = brightness
            result.data[offset] = currentData.data[offset]
            result.data[offset + 1] = currentData.data[offset + 1]
            result.data[offset + 2] = currentData.data[offset + 2]
            result.data[offset + 3] = 255
          }
        }
      }

      reportProgress(frameIndex, frameCount, onProgress)
    }

    return finalizeResult(ctx, result)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
