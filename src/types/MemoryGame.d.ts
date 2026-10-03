type FrameMetrics = {
  baselineRatio: number
  motionRatio: number
  stableCardCount: number
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

type CardLayoutPercent = {
  left: number
  top: number
  cardWidth: number
  cardHeight: number
  gapX: number
  gapY: number
}

type ErrorNotice = {
  title: string
  description: string
}

type VideoProcessingPhase =
  | "loading"
  | "preparing"
  | "capturing"
  | "waiting"
  | "analyzing"
  | "merging"
  | "exporting"
  | "complete"

type VideoProcessingProgress = {
  phase: VideoProcessingPhase
  current: number
  total: number
  percent: number
  videoTime?: number
  startTime?: number
}
