import { captureVideoFrames } from "./captureVideoFrames"

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

  Current strategy:
  - Detect the active gameplay range first (avoid pre-start and end-state noise).
  - Merge per-card (8x3 grid) and keep the best frame per cell based on
    "revealed content" confidence and local sharpness.
*/
const PROCESSING_CONFIG = {
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
}

// Internal tuning for motion detection and active-range extraction.
const MOTION_THRESHOLD = 14

const ACTIVE_RANGE_RULES = {
  maxBaselineRatio: 0.35,
  marginFrames: 2,
}

const ANALYSIS_SCALE_DOWN = 0.25
const GRID_COLS = 8
const GRID_ROWS = 3
const CARD_EVAL_INSET_RATIO = 0.12
const CARD_COPY_BUFFER_RATIO = { left: 0.015, right: 0.015, top: 0.04, bottom: 0.02 }
const CARD_MIN_DIFF_RATIO = 0.08
const CARD_MAX_LOCAL_MOTION_RATIO = 0.25
const SHARPEN_STRENGTH = 0.35
const MAX_PROCESSING_DURATION_SECONDS = 10

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max))

const shouldEmitProgress = (completed: number, total: number): boolean =>
  completed % PROCESSING_CONFIG.progressUpdateInterval === 0 || completed === total

// Let React commit progress and the browser paint between batches of pixel work.
const yieldForPaint = (): Promise<void> =>
  new Promise((resolve) => {
    if (document.hidden) window.setTimeout(resolve, 0)
    else window.requestAnimationFrame(() => window.setTimeout(resolve, 0))
  })

const isValidCardLayoutPercent = (layout: CardLayoutPercent): boolean => {
  if (layout.cardWidth <= 0 || layout.cardHeight <= 0 || layout.gapX < 0 || layout.gapY < 0) {
    return false
  }

  const totalWidth = layout.left + GRID_COLS * layout.cardWidth + (GRID_COLS - 1) * layout.gapX
  const totalHeight = layout.top + GRID_ROWS * layout.cardHeight + (GRID_ROWS - 1) * layout.gapY

  return layout.left >= 0 && layout.top >= 0 && totalWidth <= 1 && totalHeight <= 1
}

const toGridCellRegion = (
  baseRect: Rect,
  frameWidth: number,
  frameHeight: number,
  copyBufferRatio?: typeof CARD_COPY_BUFFER_RATIO,
): GridCellRegion => {
  // Use a smaller inner region for scoring to avoid card borders/shadows affecting metrics.
  const cellWidth = Math.max(1, baseRect.right - baseRect.left)
  const cellHeight = Math.max(1, baseRect.bottom - baseRect.top)
  const insetX = Math.floor(cellWidth * CARD_EVAL_INSET_RATIO)
  const insetY = Math.floor(cellHeight * CARD_EVAL_INSET_RATIO)

  const evalLeft = clamp(baseRect.left + insetX, baseRect.left, baseRect.right - 1)
  const evalRight = clamp(baseRect.right - insetX, evalLeft + 1, baseRect.right)
  const evalTop = clamp(baseRect.top + insetY, baseRect.top, baseRect.bottom - 1)
  const evalBottom = clamp(baseRect.bottom - insetY, evalTop + 1, baseRect.bottom)

  if (!copyBufferRatio) {
    return {
      copyRect: baseRect,
      evalRect: { left: evalLeft, top: evalTop, right: evalRight, bottom: evalBottom },
      evalPixelCount: Math.max(1, (evalRight - evalLeft) * (evalBottom - evalTop)),
    }
  }

  // Expand copy area slightly so the final merge keeps anti-aliased text/edge pixels.
  const copyLeft = clamp(baseRect.left - Math.round(cellWidth * copyBufferRatio.left), 0, Math.max(0, frameWidth - 2))
  const copyRight = clamp(baseRect.right + Math.round(cellWidth * copyBufferRatio.right), copyLeft + 1, frameWidth)
  const copyTop = clamp(baseRect.top - Math.round(cellHeight * copyBufferRatio.top), 0, Math.max(0, frameHeight - 2))
  const copyBottom = clamp(baseRect.bottom + Math.round(cellHeight * copyBufferRatio.bottom), copyTop + 1, frameHeight)

  return {
    copyRect: { left: copyLeft, top: copyTop, right: copyRight, bottom: copyBottom },
    evalRect: { left: evalLeft, top: evalTop, right: evalRight, bottom: evalBottom },
    evalPixelCount: Math.max(1, (evalRight - evalLeft) * (evalBottom - evalTop)),
  }
}

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

      regions.push(toGridCellRegion({ left, top, right, bottom }, width, height))
    }
  }

  return regions
}

const buildGridRegions = (width: number, height: number): GridCellRegion[] => {
  const layout = PROCESSING_CONFIG.cardLayoutPercent
  if (!isValidCardLayoutPercent(layout)) {
    // Fallback for unknown layouts/videos: treat the board as a plain 8x3 uniform grid.
    return buildUniformGridRegions(width, height)
  }

  const regions: GridCellRegion[] = []

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const leftPercent = layout.left + col * (layout.cardWidth + layout.gapX)
      const topPercent = layout.top + row * (layout.cardHeight + layout.gapY)

      const left = clamp(Math.round(leftPercent * width), 0, Math.max(0, width - 2))
      const right = clamp(Math.round((leftPercent + layout.cardWidth) * width), left + 1, width)
      const top = clamp(Math.round(topPercent * height), 0, Math.max(0, height - 2))
      const bottom = clamp(Math.round((topPercent + layout.cardHeight) * height), top + 1, height)

      regions.push(toGridCellRegion({ left, top, right, bottom }, width, height, CARD_COPY_BUFFER_RATIO))
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

const countFrameDiffs = (
  currentPixels: Uint8ClampedArray,
  baselinePixels: Uint8ClampedArray,
  baselineThreshold: number,
  previousPixels?: Uint8ClampedArray,
): { baselineChanged: number; motionChanged: number } => {
  let baselineChanged = 0
  let motionChanged = 0

  for (let offset = 0; offset < currentPixels.length; offset += 4) {
    if (getBrightnessDiff(currentPixels, baselinePixels, offset) > baselineThreshold) {
      baselineChanged += 1
    }

    if (previousPixels && getBrightnessDiff(currentPixels, previousPixels, offset) > MOTION_THRESHOLD) {
      motionChanged += 1
    }
  }

  return { baselineChanged, motionChanged }
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

const countStableChangedCards = (
  currentPixels: Uint8ClampedArray,
  baselinePixels: Uint8ClampedArray,
  previousPixels: Uint8ClampedArray | undefined,
  imageWidth: number,
  regions: GridCellRegion[],
): number => {
  let stableCardCount = 0
  for (const { evalRect, evalPixelCount } of regions) {
    let changedPixels = 0
    let movingPixels = 0
    for (let y = evalRect.top; y < evalRect.bottom; y += 1) {
      for (let x = evalRect.left; x < evalRect.right; x += 1) {
        const offset = (y * imageWidth + x) * 4
        if (getBrightnessDiff(currentPixels, baselinePixels, offset) > PROCESSING_CONFIG.threshold) changedPixels += 1
        if (previousPixels && getBrightnessDiff(currentPixels, previousPixels, offset) > MOTION_THRESHOLD)
          movingPixels += 1
      }
    }
    if (
      changedPixels / evalPixelCount >= CARD_MIN_DIFF_RATIO &&
      movingPixels / evalPixelCount <= CARD_MAX_LOCAL_MOTION_RATIO
    ) {
      stableCardCount += 1
    }
  }
  return stableCardCount
}

const hasStableCardContent = ({ baselineRatio, stableCardCount }: FrameMetrics): boolean =>
  stableCardCount > 0 && baselineRatio <= ACTIVE_RANGE_RULES.maxBaselineRatio

const detectActiveFrameRange = (metrics: FrameMetrics[]): { start: number; end: number } => {
  if (metrics.length === 0) {
    return { start: 0, end: 0 }
  }

  const firstActive = metrics.findIndex(hasStableCardContent)
  let lastActive = metrics.length - 1
  while (lastActive > firstActive && !hasStableCardContent(metrics[lastActive])) lastActive -= 1
  if (firstActive !== -1) {
    // Keep isolated early reveals too; a later motion streak must not trim them away.
    return {
      start: Math.max(0, firstActive - ACTIVE_RANGE_RULES.marginFrames),
      end: Math.min(metrics.length - 1, lastActive + ACTIVE_RANGE_RULES.marginFrames),
    }
  }

  // If all detection fails, keep everything to avoid returning an empty result.
  return { start: 0, end: metrics.length - 1 }
}

const buildMergeFrameIndices = (metrics: FrameMetrics[], range: { start: number; end: number }): number[] => {
  const filtered: number[] = []

  // Evaluate each card, so a single reveal can survive even with little whole-frame change.
  for (let frameIndex = range.start; frameIndex <= range.end; frameIndex += 1) {
    if (hasStableCardContent(metrics[frameIndex])) {
      filtered.push(frameIndex)
    }
  }

  if (filtered.length > 0) {
    return filtered
  }

  // Safety fallback: if filtering is too strict for a specific recording, merge the whole active range.
  const fullRange: number[] = []
  for (let frameIndex = range.start; frameIndex <= range.end; frameIndex += 1) {
    fullRange.push(frameIndex)
  }
  return fullRange
}

export const processVideoToImage = async (
  blob: Blob,
  onProgress?: (progress: VideoProcessingProgress) => void,
): Promise<string> => {
  const frames = await captureVideoFrames(blob, {
    fps: PROCESSING_CONFIG.fps,
    scaleDown: PROCESSING_CONFIG.scaleDown,
    startTime: 0,
    endTime: MAX_PROCESSING_DURATION_SECONDS,
    onProgress: (current, total, details) =>
      onProgress?.({
        phase: details.phase,
        current,
        total,
        percent: Math.min(80, (80 * details.videoTime) / details.endTime),
        videoTime: details.videoTime,
        startTime: details.startTime,
      }),
  })
  return processVideoFramesToImage(frames, onProgress)
}

export const processVideoFramesToImage = async (
  frames: ImageData[],
  onProgress?: (progress: VideoProcessingProgress) => void,
): Promise<string> => {
  if (frames.length === 0) throw new Error("Video contains no decodable frames")
  const frameCount = frames.length
  onProgress?.({ phase: "analyzing", current: 0, total: frameCount, percent: 80 })
  await yieldForPaint()

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

  outputCanvas.width = frames[0].width
  outputCanvas.height = frames[0].height

  const analysisScaleDown = Math.min(PROCESSING_CONFIG.scaleDown, ANALYSIS_SCALE_DOWN)
  analysisCanvas.width = Math.max(1, Math.floor((outputCanvas.width * analysisScaleDown) / PROCESSING_CONFIG.scaleDown))
  analysisCanvas.height = Math.max(
    1,
    Math.floor((outputCanvas.height * analysisScaleDown) / PROCESSING_CONFIG.scaleDown),
  )

  const analysisPixelCount = analysisCanvas.width * analysisCanvas.height
  const analysisRegions = buildGridRegions(analysisCanvas.width, analysisCanvas.height)
  // The last sampled frame is the reference board, normally with cards face-down.
  const baselineData = frames[frameCount - 1]
  outputCtx.putImageData(baselineData, 0, 0)
  analysisCtx.drawImage(outputCanvas, 0, 0, analysisCanvas.width, analysisCanvas.height)
  const analysisBaselineData = analysisCtx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height)

  // Phase 1: analyze frame metrics to detect the active card-flip range.
  const frameMetrics: FrameMetrics[] = new Array(frameCount)
  let previousFrameData: ImageData | null = null

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    outputCtx.putImageData(frames[frameIndex], 0, 0)
    analysisCtx.drawImage(outputCanvas, 0, 0, analysisCanvas.width, analysisCanvas.height)
    const currentData = analysisCtx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height)
    const currentPixels = currentData.data
    const baselinePixels = analysisBaselineData.data
    const previousPixels = previousFrameData?.data

    const { baselineChanged, motionChanged } = countFrameDiffs(
      currentPixels,
      baselinePixels,
      PROCESSING_CONFIG.threshold,
      previousPixels,
    )

    frameMetrics[frameIndex] = {
      baselineRatio: baselineChanged / analysisPixelCount,
      motionRatio: previousFrameData ? motionChanged / analysisPixelCount : 0,
      stableCardCount: countStableChangedCards(
        currentPixels,
        baselinePixels,
        previousPixels,
        analysisCanvas.width,
        analysisRegions,
      ),
    }
    previousFrameData = currentData

    const analyzedFrames = frameIndex + 1
    if (shouldEmitProgress(analyzedFrames, frameCount)) {
      onProgress?.({
        phase: "analyzing",
        current: analyzedFrames,
        total: frameCount,
        percent: 80 + (10 * analyzedFrames) / frameCount,
      })
      await yieldForPaint()
    }
  }

  const activeRange = detectActiveFrameRange(frameMetrics)
  const mergeFrameIndices = buildMergeFrameIndices(frameMetrics, activeRange)

  const mergeFrameCount = mergeFrameIndices.length
  onProgress?.({ phase: "merging", current: 0, total: mergeFrameCount, percent: 90 })
  await yieldForPaint()

  // Phase 2: card-aware merge (8x3 grid). Pick the sharpest revealed state per card.
  const result = outputCtx.createImageData(outputCanvas.width, outputCanvas.height)
  result.data.set(baselineData.data)
  const baselinePixels = baselineData.data
  const resultPixels = result.data
  const gridRegions = buildGridRegions(outputCanvas.width, outputCanvas.height)
  const bestCellScores = new Float32Array(gridRegions.length).fill(-1)

  for (let mergeIndex = 0; mergeIndex < mergeFrameCount; mergeIndex += 1) {
    const frameIndex = mergeFrameIndices[mergeIndex]
    const currentPixels = frames[frameIndex].data
    const previousMergePixels = frames[frameIndex - 1]?.data

    for (let cellIndex = 0; cellIndex < gridRegions.length; cellIndex += 1) {
      const { evalRect, evalPixelCount, copyRect } = gridRegions[cellIndex]
      let changedPixels = 0
      let brightnessSum = 0
      let brightnessSqSum = 0
      let localMotionPixels = 0

      for (let y = evalRect.top; y < evalRect.bottom; y += 1) {
        for (let x = evalRect.left; x < evalRect.right; x += 1) {
          const offset = (y * outputCanvas.width + x) * 4
          const currentBrightness = (currentPixels[offset] + currentPixels[offset + 1] + currentPixels[offset + 2]) / 3

          if (getBrightnessDiff(currentPixels, baselinePixels, offset) > PROCESSING_CONFIG.threshold) {
            changedPixels += 1
          }

          if (previousMergePixels && getBrightnessDiff(currentPixels, previousMergePixels, offset) > MOTION_THRESHOLD) {
            localMotionPixels += 1
          }

          brightnessSum += currentBrightness
          brightnessSqSum += currentBrightness * currentBrightness
        }
      }

      const changedRatio = changedPixels / evalPixelCount
      if (changedRatio < CARD_MIN_DIFF_RATIO) {
        // Not enough revealed content in this cell yet.
        continue
      }

      const localMotionRatio = previousMergePixels
        ? localMotionPixels / evalPixelCount
        : frameMetrics[frameIndex].motionRatio
      if (localMotionRatio > CARD_MAX_LOCAL_MOTION_RATIO) {
        // Skip frames where this cell is likely in transition blur.
        continue
      }

      const meanBrightness = brightnessSum / evalPixelCount
      const brightnessVariance = Math.max(0, brightnessSqSum / evalPixelCount - meanBrightness * meanBrightness)
      const motionPenalty = 1 / (1 + localMotionRatio * 25)
      // Higher variance often means richer face-up card detail (text/icon), not a flat back-face.
      const score = changedRatio * brightnessVariance * motionPenalty

      if (score > bestCellScores[cellIndex]) {
        bestCellScores[cellIndex] = score
        copyRectPixels(currentPixels, resultPixels, outputCanvas.width, copyRect)
      }
    }

    const activeProgress = mergeIndex + 1
    if (shouldEmitProgress(activeProgress, mergeFrameCount)) {
      onProgress?.({
        phase: "merging",
        current: activeProgress,
        total: mergeFrameCount,
        percent: 90 + (8 * activeProgress) / mergeFrameCount,
      })
      await yieldForPaint()
    }
  }

  // Keep each selected card as one coherent frame. Mixing individual pixels
  // from other candidates can stamp Ready/Start text or a rotating back onto its face.

  onProgress?.({ phase: "exporting", current: frameCount, total: frameCount, percent: 98 })
  await yieldForPaint()

  applySharpen(result, outputCanvas.width, outputCanvas.height, SHARPEN_STRENGTH)
  outputCtx.putImageData(result, 0, 0)
  const resultImage = outputCanvas.toDataURL("image/png")
  onProgress?.({ phase: "complete", current: frameCount, total: frameCount, percent: 100 })
  return resultImage
}
