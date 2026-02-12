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

type ErrorNotice = {
  title: string
  description: string
}
