type CaptureProgressDetails = {
  phase: "preparing" | "capturing" | "waiting"
  videoTime: number
  startTime: number
  endTime: number
}

type CaptureVideoFramesOptions = {
  fps: number
  scaleDown: number
  startTime: number
  endTime: number
  onProgress?: (current: number, total: number, details: CaptureProgressDetails) => void
}

const METADATA_TIMEOUT_MS = 10_000
const PLAYBACK_TIMEOUT_MARGIN_MS = 10_000

export const captureVideoFrames = async (
  blob: Blob,
  { fps, scaleDown, startTime, endTime, onProgress }: CaptureVideoFramesOptions,
): Promise<ImageData[]> => {
  const video = document.createElement("video")
  video.preload = "auto"
  video.muted = true
  video.playsInline = true
  video.setAttribute("aria-hidden", "true")
  Object.assign(video.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    bottom: "0",
    right: "0",
    opacity: "0",
    pointerEvents: "none",
  })
  document.body.appendChild(video)
  const objectUrl = URL.createObjectURL(blob)

  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timeoutId)
        video.removeEventListener("loadedmetadata", handleLoaded)
        video.removeEventListener("error", handleError)
      }
      const handleLoaded = () => {
        cleanup()
        resolve()
      }
      const handleError = () => {
        cleanup()
        reject(new Error("Unable to load video metadata"))
      }
      const timeoutId = window.setTimeout(() => {
        cleanup()
        reject(new Error("Loading video metadata timed out"))
      }, METADATA_TIMEOUT_MS)

      video.addEventListener("loadedmetadata", handleLoaded, { once: true })
      video.addEventListener("error", handleError, { once: true })
      video.src = objectUrl
    })

    const processingEndTime =
      Number.isFinite(video.duration) && video.duration > 0 ? Math.min(video.duration, endTime) : endTime
    const processingStartTime = Math.min(startTime, Math.max(processingEndTime - 1 / fps, 0))
    const expectedFrameCount = Math.max(1, Math.ceil((processingEndTime - processingStartTime) * fps))
    const lastSampleTime = processingStartTime + (expectedFrameCount - 1) / fps
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.floor(video.videoWidth * scaleDown))
    canvas.height = Math.max(1, Math.floor(video.videoHeight * scaleDown))
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) {
      throw new Error("Canvas 2D context is not available")
    }

    const frames: ImageData[] = []
    const reportProgress = (mediaTime: number, paused = false) => {
      onProgress?.(frames.length, expectedFrameCount, {
        phase: paused ? "waiting" : mediaTime < processingStartTime ? "preparing" : "capturing",
        videoTime: Math.min(mediaTime, processingEndTime),
        startTime: processingStartTime,
        endTime: processingEndTime,
      })
    }
    reportProgress(0)

    // Decode from the beginning instead of seeking. Firefox can seek to a later
    // WebM keyframe while reporting the requested currentTime for MediaRecorder blobs.
    await new Promise<void>((resolve, reject) => {
      let nextSampleTime = processingStartTime
      let frameCallbackId: number | undefined
      let animationFrameId: number | undefined
      let timeoutId: number | undefined
      let lastReportedTime = -Infinity
      let settled = false
      const cancelFrame = () => {
        if (frameCallbackId !== undefined) video.cancelVideoFrameCallback(frameCallbackId)
        if (animationFrameId !== undefined) window.cancelAnimationFrame(animationFrameId)
        frameCallbackId = undefined
        animationFrameId = undefined
      }
      const cleanup = () => {
        window.clearTimeout(timeoutId)
        cancelFrame()
        document.removeEventListener("visibilitychange", handleVisibilityChange)
        video.removeEventListener("ended", handleEnded)
        video.removeEventListener("error", handleError)
        video.pause()
      }
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        cleanup()
        if (error) reject(error)
        else {
          reportProgress(Math.min(video.currentTime, processingEndTime))
          resolve()
        }
      }
      const capture = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
      }
      const handleEnded = () => {
        // A short or low-frame-rate recording may end before the last target time.
        if (frames.length === 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) capture()
        finish(frames.length === 0 ? new Error("Video contains no decodable frames") : undefined)
      }
      const handleError = () => finish(new Error("Unable to decode video frames"))
      const sampleFrame = (mediaTime: number) => {
        if (settled) return
        if (mediaTime + 0.001 >= nextSampleTime && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          capture()
          nextSampleTime = processingStartTime + (Math.floor((mediaTime + 0.001 - processingStartTime) * fps) + 1) / fps
          reportProgress(mediaTime)
          lastReportedTime = mediaTime
        } else if (mediaTime - lastReportedTime >= 0.1) {
          reportProgress(mediaTime)
          lastReportedTime = mediaTime
        }
        if (mediaTime + 0.001 >= lastSampleTime && frames.length > 0) {
          finish()
          return
        }
        scheduleFrame()
      }
      const scheduleFrame = () => {
        if (typeof video.requestVideoFrameCallback === "function") {
          frameCallbackId = video.requestVideoFrameCallback((_now, metadata) => sampleFrame(metadata.mediaTime))
        } else {
          animationFrameId = window.requestAnimationFrame(() => sampleFrame(video.currentTime))
        }
      }
      const handleVisibilityChange = () => {
        if (settled) return
        window.clearTimeout(timeoutId)
        cancelFrame()
        // Background tabs may stop delivering frame callbacks. Pause playback too,
        // so auto-stopped recordings do not lose reveals while the game has focus.
        if (document.hidden) {
          video.pause()
          reportProgress(video.currentTime, true)
          return
        }
        reportProgress(video.currentTime)
        timeoutId = window.setTimeout(
          () => finish(new Error("Decoding video frames timed out")),
          processingEndTime * 1000 + PLAYBACK_TIMEOUT_MARGIN_MS,
        )
        scheduleFrame()
        void video.play().catch(() => finish(new Error("Unable to play video for frame processing")))
      }

      video.addEventListener("ended", handleEnded, { once: true })
      video.addEventListener("error", handleError, { once: true })
      document.addEventListener("visibilitychange", handleVisibilityChange)
      handleVisibilityChange()
    })

    return frames
  } finally {
    video.pause()
    video.removeAttribute("src")
    video.load()
    video.remove()
    URL.revokeObjectURL(objectUrl)
  }
}
