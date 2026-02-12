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
export const PROCESSING_CONFIG = {
  // Process only N frames per second (skip intermediate frames).
  fps: 10,
  // Scale frame before pixel analysis (0.5 = 50% of original size).
  scaleDown: 0.5,
  // Pixel-difference threshold (0-255) to consider a pixel "changed".
  threshold: 30,
  // Emit UI progress every N analyzed/merged frames.
  progressUpdateInterval: 5,
  // Card layout percentages relative to full processed frame.
  // Tune these values when source videos use a different UI scale/layout.
  cardLayoutPercent: {
    left: 0.07525,
    top: 0.2295,
    cardWidth: 0.092,
    cardHeight: 0.22425,
    gapX: 0.01625,
    gapY: 0.02775,
  },
  // Extra copy padding around each card area (ratio of card size).
  cardAreaBufferPercent: {
    left: 0.015,
    right: 0.015,
    top: 0.04,
    bottom: 0.02,
  },
}

// Internal tuning for motion detection and active-range extraction.
const MOTION_THRESHOLD = 14

const ACTIVE_RANGE_RULES = {
  minBaselineRatio: 0.015,
  maxBaselineRatio: 0.35,
  minMotionRatio: 0.005,
  minActiveStreak: 2,
  marginFrames: 2,
}

const ANALYSIS_SCALE_DOWN = 0.25
const GRID_COLS = 8
const GRID_ROWS = 3
const CARD_EVAL_INSET_RATIO = 0.12
const CARD_MIN_DIFF_RATIO = 0.08
const CARD_MAX_LOCAL_MOTION_RATIO = 0.25
const CARD_CANDIDATE_LIMIT = 3
const SHARPEN_STRENGTH = 0.35

type FrameMetrics = {
  baselineRatio: number
  motionRatio: number
}

type Rect = {
  left: number
  top: number
  right: number
  bottom: number
}

type GridCellRegion = {
  copyRect: Rect
  evalRect: Rect
  evalPixelCount: number
}

type CardCandidate = {
  frameIndex: number
  score: number
}

type CardLayoutPercent = {
  left: number
  top: number
  cardWidth: number
  cardHeight: number
  gapX: number
  gapY: number
}

type CardAreaBufferPercent = {
  left: number
  right: number
  top: number
  bottom: number
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max))

const isValidCardLayoutPercent = (layout: CardLayoutPercent): boolean => {
  if (layout.cardWidth <= 0 || layout.cardHeight <= 0 || layout.gapX < 0 || layout.gapY < 0) {
    return false
  }

  const totalWidth = layout.left + GRID_COLS * layout.cardWidth + (GRID_COLS - 1) * layout.gapX
  const totalHeight = layout.top + GRID_ROWS * layout.cardHeight + (GRID_ROWS - 1) * layout.gapY

  return layout.left >= 0 && layout.top >= 0 && totalWidth <= 1 && totalHeight <= 1
}

const isValidCardAreaBufferPercent = (buffer: CardAreaBufferPercent): boolean =>
  buffer.left >= 0 && buffer.right >= 0 && buffer.top >= 0 && buffer.bottom >= 0

const buildUniformGridRegions = (width: number, height: number): GridCellRegion[] => {
  const xEdges = Array.from({ length: GRID_COLS + 1 }, (_, index) => Math.round((index / GRID_COLS) * width))
  const yEdges = Array.from({ length: GRID_ROWS + 1 }, (_, index) => Math.round((index / GRID_ROWS) * height))
  const regions: GridCellRegion[] = []

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const left = xEdges[col]
      const right = xEdges[col + 1]
      const top = yEdges[row]
      const bottom = yEdges[row + 1]

      const cellWidth = Math.max(1, right - left)
      const cellHeight = Math.max(1, bottom - top)
      const insetX = Math.floor(cellWidth * CARD_EVAL_INSET_RATIO)
      const insetY = Math.floor(cellHeight * CARD_EVAL_INSET_RATIO)

      const evalLeft = clamp(left + insetX, left, right - 1)
      const evalRight = clamp(right - insetX, evalLeft + 1, right)
      const evalTop = clamp(top + insetY, top, bottom - 1)
      const evalBottom = clamp(bottom - insetY, evalTop + 1, bottom)

      regions.push({
        copyRect: { left, top, right, bottom },
        evalRect: { left: evalLeft, top: evalTop, right: evalRight, bottom: evalBottom },
        evalPixelCount: Math.max(1, (evalRight - evalLeft) * (evalBottom - evalTop)),
      })
    }
  }

  return regions
}

const buildGridRegions = (width: number, height: number): GridCellRegion[] => {
  const layout = PROCESSING_CONFIG.cardLayoutPercent
  if (!isValidCardLayoutPercent(layout)) {
    return buildUniformGridRegions(width, height)
  }
  const buffer = PROCESSING_CONFIG.cardAreaBufferPercent
  const hasValidBuffer = isValidCardAreaBufferPercent(buffer)

  const regions: GridCellRegion[] = []

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const leftPercent = layout.left + col * (layout.cardWidth + layout.gapX)
      const topPercent = layout.top + row * (layout.cardHeight + layout.gapY)

      const left = clamp(Math.round(leftPercent * width), 0, Math.max(0, width - 2))
      const right = clamp(Math.round((leftPercent + layout.cardWidth) * width), left + 1, width)
      const top = clamp(Math.round(topPercent * height), 0, Math.max(0, height - 2))
      const bottom = clamp(Math.round((topPercent + layout.cardHeight) * height), top + 1, height)

      const cellWidth = Math.max(1, right - left)
      const cellHeight = Math.max(1, bottom - top)
      const copyLeft = hasValidBuffer
        ? clamp(left - Math.round(cellWidth * buffer.left), 0, Math.max(0, width - 2))
        : left
      const copyRight = hasValidBuffer
        ? clamp(right + Math.round(cellWidth * buffer.right), copyLeft + 1, width)
        : right
      const copyTop = hasValidBuffer
        ? clamp(top - Math.round(cellHeight * buffer.top), 0, Math.max(0, height - 2))
        : top
      const copyBottom = hasValidBuffer
        ? clamp(bottom + Math.round(cellHeight * buffer.bottom), copyTop + 1, height)
        : bottom
      const insetX = Math.floor(cellWidth * CARD_EVAL_INSET_RATIO)
      const insetY = Math.floor(cellHeight * CARD_EVAL_INSET_RATIO)

      const evalLeft = clamp(left + insetX, left, right - 1)
      const evalRight = clamp(right - insetX, evalLeft + 1, right)
      const evalTop = clamp(top + insetY, top, bottom - 1)
      const evalBottom = clamp(bottom - insetY, evalTop + 1, bottom)

      regions.push({
        copyRect: { left: copyLeft, top: copyTop, right: copyRight, bottom: copyBottom },
        evalRect: { left: evalLeft, top: evalTop, right: evalRight, bottom: evalBottom },
        evalPixelCount: Math.max(1, (evalRight - evalLeft) * (evalBottom - evalTop)),
      })
    }
  }

  return regions
}

const copyRectPixels = (
  sourcePixels: Uint8ClampedArray,
  targetPixels: Uint8ClampedArray,
  imageWidth: number,
  rect: Rect,
): void => {
  for (let y = rect.top; y < rect.bottom; y += 1) {
    const rowStart = (y * imageWidth + rect.left) * 4
    const rowEnd = (y * imageWidth + rect.right) * 4
    targetPixels.set(sourcePixels.subarray(rowStart, rowEnd), rowStart)
  }
}

const getBrightnessDiff = (first: Uint8ClampedArray, second: Uint8ClampedArray, offset: number): number =>
  (Math.abs(first[offset] - second[offset]) +
    Math.abs(first[offset + 1] - second[offset + 1]) +
    Math.abs(first[offset + 2] - second[offset + 2])) /
  3

const pushCardCandidate = (candidates: CardCandidate[], next: CardCandidate): void => {
  const duplicate = candidates.find((candidate) => candidate.frameIndex === next.frameIndex)
  if (duplicate) {
    if (next.score > duplicate.score) {
      duplicate.score = next.score
    }
  } else {
    candidates.push(next)
  }

  candidates.sort((first, second) => second.score - first.score)
  if (candidates.length > CARD_CANDIDATE_LIMIT) {
    candidates.length = CARD_CANDIDATE_LIMIT
  }
}

const applySharpen = (imageData: ImageData, width: number, height: number, strength: number): void => {
  if (strength <= 0 || width < 3 || height < 3) {
    return
  }

  const source = imageData.data.slice()
  const target = imageData.data
  const rowStride = width * 4
  const neighborWeight = -strength
  const centerWeight = 1 + 4 * strength

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = (y * width + x) * 4

      for (let channel = 0; channel < 3; channel += 1) {
        const value =
          source[offset + channel] * centerWeight +
          source[offset - 4 + channel] * neighborWeight +
          source[offset + 4 + channel] * neighborWeight +
          source[offset - rowStride + channel] * neighborWeight +
          source[offset + rowStride + channel] * neighborWeight

        target[offset + channel] = clamp(Math.round(value), 0, 255)
      }
    }
  }
}

const isBaselineWithinActiveRange = (baselineRatio: number): boolean =>
  baselineRatio >= ACTIVE_RANGE_RULES.minBaselineRatio && baselineRatio <= ACTIVE_RANGE_RULES.maxBaselineRatio

const detectActiveFrameRange = (metrics: FrameMetrics[]): { start: number; end: number } => {
  if (metrics.length === 0) {
    return { start: 0, end: 0 }
  }

  const candidate = metrics.map(({ baselineRatio, motionRatio }) => {
    return isBaselineWithinActiveRange(baselineRatio) && motionRatio >= ACTIVE_RANGE_RULES.minMotionRatio
  })

  let streak = 0
  let firstActive = -1
  let lastActive = -1

  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index]) {
      streak += 1
      if (streak >= ACTIVE_RANGE_RULES.minActiveStreak) {
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
    start: Math.max(0, firstActive - ACTIVE_RANGE_RULES.marginFrames),
    end: Math.min(metrics.length - 1, lastActive + ACTIVE_RANGE_RULES.marginFrames),
  }
}

export const processVideoToImage = async (
  blob: Blob,
  onProgress?: (current: number, total: number) => void,
): Promise<string> => {
  // Browser-only decode path: HTMLVideoElement + Canvas (no ffmpeg/OpenCV).
  const video = document.createElement("video")
  video.preload = "auto"
  video.muted = true
  video.playsInline = true
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

    const seekTo = (requestedTime: number, options?: { preferFastSeek?: boolean }): Promise<void> => {
      const maxTime = Number.isFinite(video.duration) ? Math.max(video.duration - 0.001, 0) : 0
      const targetTime = Math.min(Math.max(requestedTime, 0), maxTime)
      const preferFastSeek = options?.preferFastSeek ?? false

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
        if (preferFastSeek && typeof video.fastSeek === "function") {
          video.fastSeek(targetTime)
        } else {
          video.currentTime = targetTime
        }
      })
    }

    await seekTo(0)

    const outputCanvas = document.createElement("canvas")
    const outputCtx = outputCanvas.getContext("2d")
    if (!outputCtx) {
      throw new Error("Canvas 2D context is not available")
    }

    const analysisCanvas = document.createElement("canvas")
    const analysisCtx = analysisCanvas.getContext("2d")
    if (!analysisCtx) {
      throw new Error("Canvas 2D context is not available")
    }

    outputCanvas.width = Math.max(1, Math.floor(video.videoWidth * PROCESSING_CONFIG.scaleDown))
    outputCanvas.height = Math.max(1, Math.floor(video.videoHeight * PROCESSING_CONFIG.scaleDown))

    const analysisScaleDown = Math.min(PROCESSING_CONFIG.scaleDown, ANALYSIS_SCALE_DOWN)
    analysisCanvas.width = Math.max(1, Math.floor(video.videoWidth * analysisScaleDown))
    analysisCanvas.height = Math.max(1, Math.floor(video.videoHeight * analysisScaleDown))

    const frameCount = Math.max(1, Math.floor(video.duration * PROCESSING_CONFIG.fps))
    const analysisPixelCount = analysisCanvas.width * analysisCanvas.height
    const totalProgressFrames = frameCount * 2

    onProgress?.(0, totalProgressFrames)

    // Baseline is sampled near the end and used as the reference for pixel-difference checks.
    // Emit first progress tick so users see processing starts immediately after upload.
    onProgress?.(1, totalProgressFrames)
    await seekTo(video.duration - 0.1, { preferFastSeek: true })
    analysisCtx.drawImage(video, 0, 0, analysisCanvas.width, analysisCanvas.height)
    const analysisBaselineData = analysisCtx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height)
    outputCtx.drawImage(video, 0, 0, outputCanvas.width, outputCanvas.height)
    const baselineData = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height)

    // Phase 1: analyze frame metrics to detect the active card-flip range.
    const frameMetrics: FrameMetrics[] = new Array(frameCount)
    let previousFrameData: ImageData | null = null

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      await seekTo(frameIndex / PROCESSING_CONFIG.fps)
      analysisCtx.drawImage(video, 0, 0, analysisCanvas.width, analysisCanvas.height)
      const currentData = analysisCtx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height)
      const currentPixels = currentData.data
      const baselinePixels = analysisBaselineData.data
      const previousPixels = previousFrameData?.data

      let baselineChanged = 0
      let motionChanged = 0

      for (let offset = 0; offset < currentPixels.length; offset += 4) {
        const baselineDiff =
          (Math.abs(currentPixels[offset] - baselinePixels[offset]) +
            Math.abs(currentPixels[offset + 1] - baselinePixels[offset + 1]) +
            Math.abs(currentPixels[offset + 2] - baselinePixels[offset + 2])) /
          3
        if (baselineDiff > PROCESSING_CONFIG.threshold) {
          baselineChanged += 1
        }

        if (previousPixels) {
          const motionDiff =
            (Math.abs(currentPixels[offset] - previousPixels[offset]) +
              Math.abs(currentPixels[offset + 1] - previousPixels[offset + 1]) +
              Math.abs(currentPixels[offset + 2] - previousPixels[offset + 2])) /
            3
          if (motionDiff > MOTION_THRESHOLD) {
            motionChanged += 1
          }
        }
      }

      frameMetrics[frameIndex] = {
        baselineRatio: baselineChanged / analysisPixelCount,
        motionRatio: previousFrameData ? motionChanged / analysisPixelCount : 0,
      }
      previousFrameData = currentData

      const analyzedFrames = frameIndex + 1
      if (analyzedFrames % PROCESSING_CONFIG.progressUpdateInterval === 0 || analyzedFrames === frameCount) {
        onProgress?.(analyzedFrames, totalProgressFrames)
      }
    }

    const activeRange = detectActiveFrameRange(frameMetrics)

    // Keep only frames that look like board-content frames; fallback to full range if empty.
    const mergeFrameIndices: number[] = []
    for (let frameIndex = activeRange.start; frameIndex <= activeRange.end; frameIndex += 1) {
      if (isBaselineWithinActiveRange(frameMetrics[frameIndex].baselineRatio)) {
        mergeFrameIndices.push(frameIndex)
      }
    }
    if (mergeFrameIndices.length === 0) {
      for (let frameIndex = activeRange.start; frameIndex <= activeRange.end; frameIndex += 1) {
        mergeFrameIndices.push(frameIndex)
      }
    }

    const mergeFrameCount = mergeFrameIndices.length

    // Phase 2: card-aware merge (8x3 grid). Pick the sharpest revealed state per card.
    const result = outputCtx.createImageData(outputCanvas.width, outputCanvas.height)
    result.data.set(baselineData.data)
    const baselinePixels = baselineData.data
    const resultPixels = result.data
    const gridRegions = buildGridRegions(outputCanvas.width, outputCanvas.height)
    const bestCellScores = new Float32Array(gridRegions.length).fill(-1)
    const cellCandidates: CardCandidate[][] = Array.from({ length: gridRegions.length }, () => [])
    let previousMergePixels: Uint8ClampedArray | null = null

    for (let mergeIndex = 0; mergeIndex < mergeFrameCount; mergeIndex += 1) {
      const frameIndex = mergeFrameIndices[mergeIndex]
      await seekTo(frameIndex / PROCESSING_CONFIG.fps)
      outputCtx.drawImage(video, 0, 0, outputCanvas.width, outputCanvas.height)
      const currentData = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height)
      const currentPixels = currentData.data

      for (let cellIndex = 0; cellIndex < gridRegions.length; cellIndex += 1) {
        const { evalRect, evalPixelCount, copyRect } = gridRegions[cellIndex]
        let changedPixels = 0
        let brightnessSum = 0
        let brightnessSqSum = 0
        let localMotionPixels = 0

        for (let y = evalRect.top; y < evalRect.bottom; y += 1) {
          for (let x = evalRect.left; x < evalRect.right; x += 1) {
            const offset = (y * outputCanvas.width + x) * 4
            const currentBrightness =
              (currentPixels[offset] + currentPixels[offset + 1] + currentPixels[offset + 2]) / 3

            if (getBrightnessDiff(currentPixels, baselinePixels, offset) > PROCESSING_CONFIG.threshold) {
              changedPixels += 1
            }

            if (
              previousMergePixels &&
              getBrightnessDiff(currentPixels, previousMergePixels, offset) > MOTION_THRESHOLD
            ) {
              localMotionPixels += 1
            }

            brightnessSum += currentBrightness
            brightnessSqSum += currentBrightness * currentBrightness
          }
        }

        const changedRatio = changedPixels / evalPixelCount
        if (changedRatio < CARD_MIN_DIFF_RATIO) {
          continue
        }

        const localMotionRatio = previousMergePixels
          ? localMotionPixels / evalPixelCount
          : frameMetrics[frameIndex].motionRatio
        if (localMotionRatio > CARD_MAX_LOCAL_MOTION_RATIO) {
          continue
        }

        const meanBrightness = brightnessSum / evalPixelCount
        const brightnessVariance = Math.max(0, brightnessSqSum / evalPixelCount - meanBrightness * meanBrightness)
        const motionPenalty = 1 / (1 + localMotionRatio * 25)
        const score = changedRatio * brightnessVariance * motionPenalty

        pushCardCandidate(cellCandidates[cellIndex], { frameIndex, score })

        if (score > bestCellScores[cellIndex]) {
          bestCellScores[cellIndex] = score
          copyRectPixels(currentPixels, resultPixels, outputCanvas.width, copyRect)
        }
      }

      const activeProgress = mergeIndex + 1
      if (activeProgress % PROCESSING_CONFIG.progressUpdateInterval === 0 || activeProgress === mergeFrameCount) {
        const mergeProgressFrames = Math.max(1, Math.round((activeProgress / mergeFrameCount) * frameCount))
        onProgress?.(frameCount + mergeProgressFrames, totalProgressFrames)
      }

      previousMergePixels = currentPixels
    }

    // Fill unresolved card pixels from fallback candidates to avoid half-card artifacts.
    const framePixelCache = new Map<number, Uint8ClampedArray>()
    const getFramePixels = async (frameIndex: number): Promise<Uint8ClampedArray> => {
      const cached = framePixelCache.get(frameIndex)
      if (cached) {
        return cached
      }

      await seekTo(frameIndex / PROCESSING_CONFIG.fps)
      outputCtx.drawImage(video, 0, 0, outputCanvas.width, outputCanvas.height)
      const framePixels = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height).data
      framePixelCache.set(frameIndex, framePixels)
      return framePixels
    }

    for (let cellIndex = 0; cellIndex < gridRegions.length; cellIndex += 1) {
      const candidates = cellCandidates[cellIndex]
      if (candidates.length < 2) {
        continue
      }

      const { copyRect } = gridRegions[cellIndex]
      for (let fallbackIndex = 1; fallbackIndex < candidates.length; fallbackIndex += 1) {
        const fallbackPixels = await getFramePixels(candidates[fallbackIndex].frameIndex)
        for (let y = copyRect.top; y < copyRect.bottom; y += 1) {
          for (let x = copyRect.left; x < copyRect.right; x += 1) {
            const offset = (y * outputCanvas.width + x) * 4
            if (getBrightnessDiff(resultPixels, baselinePixels, offset) > PROCESSING_CONFIG.threshold) {
              continue
            }

            if (getBrightnessDiff(fallbackPixels, baselinePixels, offset) <= PROCESSING_CONFIG.threshold) {
              continue
            }

            resultPixels[offset] = fallbackPixels[offset]
            resultPixels[offset + 1] = fallbackPixels[offset + 1]
            resultPixels[offset + 2] = fallbackPixels[offset + 2]
            resultPixels[offset + 3] = 255
          }
        }
      }
    }

    onProgress?.(totalProgressFrames, totalProgressFrames)

    applySharpen(result, outputCanvas.width, outputCanvas.height, SHARPEN_STRENGTH)
    outputCtx.putImageData(result, 0, 0)
    return outputCanvas.toDataURL("image/png")
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
