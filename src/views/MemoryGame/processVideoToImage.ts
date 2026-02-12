/*
  Memory Game Video -> Result Image

  Business context:
  - Video input is one Memory Game run (8 x 3 card grid).
  - The beginning of the video usually contains a "start state" (before pressing Start),
    where real card reveal actions have not started yet.
  - After the game starts, cards flip one by one and show face-up content briefly.
  - At the end, the game can return to a face-down card state.

  Target output:
  - Produce one merged image that captures as many revealed card faces as possible,
    so users can identify matching pairs quickly.

  Important constraint:
  - Noisy frames / non-reveal frames must be filtered out:
    for example pre-start screens, popups, text overlays, and transition effects.

  Current status:
  - This version keeps phase detection to filter pre-start noise.
  - The merge strategy is intentionally simple (max brightness over changed pixels)
    to preserve card detail/text sharpness.
*/
const PROCESSING_CONFIG = {
  fps: 10,
  scaleDown: 0.5,
  threshold: 30,
  motionThreshold: 14,
  minBaselineRatio: 0.015,
  maxBaselineRatio: 0.35,
  minMotionRatio: 0.005,
  minActiveStreak: 2,
  activeRangeMarginFrames: 2,
  progressUpdateInterval: 5,
}

type FrameMetrics = {
  baselineRatio: number
  motionRatio: number
}

const getPixelDifference = (first: Uint8ClampedArray, second: Uint8ClampedArray, offset: number): number => {
  const rDiff = Math.abs(first[offset] - second[offset])
  const gDiff = Math.abs(first[offset + 1] - second[offset + 1])
  const bDiff = Math.abs(first[offset + 2] - second[offset + 2])
  return (rDiff + gDiff + bDiff) / 3
}

const getPixelBrightness = (data: Uint8ClampedArray, offset: number): number => {
  return (data[offset] + data[offset + 1] + data[offset + 2]) / 3
}

const detectActiveFrameRange = (metrics: FrameMetrics[]): { start: number; end: number } => {
  if (metrics.length === 0) {
    return { start: 0, end: 0 }
  }

  const candidate = metrics.map(({ baselineRatio, motionRatio }) => {
    return (
      baselineRatio >= PROCESSING_CONFIG.minBaselineRatio &&
      baselineRatio <= PROCESSING_CONFIG.maxBaselineRatio &&
      motionRatio >= PROCESSING_CONFIG.minMotionRatio
    )
  })

  let streak = 0
  let firstActive = -1
  let lastActive = -1

  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index]) {
      streak += 1
      if (streak >= PROCESSING_CONFIG.minActiveStreak) {
        const streakStart = index - streak + 1
        if (firstActive === -1) {
          firstActive = streakStart
        }
        lastActive = index
      }
    } else {
      streak = 0
    }
  }

  if (firstActive === -1 || lastActive === -1) {
    return { start: 0, end: metrics.length - 1 }
  }

  return {
    start: Math.max(0, firstActive - PROCESSING_CONFIG.activeRangeMarginFrames),
    end: Math.min(metrics.length - 1, lastActive + PROCESSING_CONFIG.activeRangeMarginFrames),
  }
}

export const processVideoToImage = async (
  blob: Blob,
  onProgress?: (current: number, total: number) => void,
): Promise<string> => {
  // Browser-only decode path: HTMLVideoElement + Canvas (no ffmpeg/OpenCV).
  const video = document.createElement("video")
  const objectUrl = URL.createObjectURL(blob)

  try {
    await new Promise<void>((resolve, reject) => {
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
      video.src = objectUrl
    })

    const seekTo = (requestedTime: number): Promise<void> => {
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

    await seekTo(0)

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      throw new Error("Canvas 2D context is not available")
    }

    canvas.width = Math.max(1, Math.floor(video.videoWidth * PROCESSING_CONFIG.scaleDown))
    canvas.height = Math.max(1, Math.floor(video.videoHeight * PROCESSING_CONFIG.scaleDown))

    const frameCount = Math.max(1, Math.floor(video.duration * PROCESSING_CONFIG.fps))
    const pixelCount = canvas.width * canvas.height

    // Baseline is sampled near the end and used as the reference for pixel-difference checks.
    await seekTo(video.duration - 0.1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const baselineData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // Phase 1: analyze frame metrics to detect the active card-flip range.
    const frameMetrics: FrameMetrics[] = new Array(frameCount)
    let previousFrameData: ImageData | null = null

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      await seekTo(frameIndex / PROCESSING_CONFIG.fps)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      let baselineChanged = 0
      let motionChanged = 0

      for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        const offset = pixelIndex * 4
        const baselineDiff = getPixelDifference(currentData.data, baselineData.data, offset)
        if (baselineDiff > PROCESSING_CONFIG.threshold) {
          baselineChanged += 1
        }

        if (previousFrameData) {
          const motionDiff = getPixelDifference(currentData.data, previousFrameData.data, offset)
          if (motionDiff > PROCESSING_CONFIG.motionThreshold) {
            motionChanged += 1
          }
        }
      }

      frameMetrics[frameIndex] = {
        baselineRatio: baselineChanged / pixelCount,
        motionRatio: previousFrameData ? motionChanged / pixelCount : 0,
      }
      previousFrameData = currentData
    }

    const activeRange = detectActiveFrameRange(frameMetrics)
    const activeFrameCount = Math.max(1, activeRange.end - activeRange.start + 1)

    // Phase 2: merge only active range using max-brightness changed-pixel rule.
    const result = ctx.createImageData(canvas.width, canvas.height)
    result.data.set(baselineData.data)

    const maxBrightness = new Float32Array(pixelCount)
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      const offset = pixelIndex * 4
      maxBrightness[pixelIndex] = getPixelBrightness(baselineData.data, offset)
    }

    for (let frameIndex = activeRange.start; frameIndex <= activeRange.end; frameIndex += 1) {
      await seekTo(frameIndex / PROCESSING_CONFIG.fps)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        const offset = pixelIndex * 4
        const totalDiff = getPixelDifference(currentData.data, baselineData.data, offset)
        if (totalDiff <= PROCESSING_CONFIG.threshold) {
          continue
        }

        const brightness = getPixelBrightness(currentData.data, offset)
        if (brightness > maxBrightness[pixelIndex]) {
          maxBrightness[pixelIndex] = brightness
          result.data[offset] = currentData.data[offset]
          result.data[offset + 1] = currentData.data[offset + 1]
          result.data[offset + 2] = currentData.data[offset + 2]
          result.data[offset + 3] = 255
        }
      }

      const activeProgress = frameIndex - activeRange.start + 1
      if (activeProgress % PROCESSING_CONFIG.progressUpdateInterval === 0 || activeProgress === activeFrameCount) {
        onProgress?.(activeProgress, activeFrameCount)
      }
    }

    ctx.putImageData(result, 0, 0)
    return canvas.toDataURL("image/png")
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
