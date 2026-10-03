import { expect, test } from "@playwright/test"

test("captures each color in order from a browser MediaRecorder WebM", async ({ page }) => {
  await page.goto("/")
  const result = await page.evaluate(async () => {
    const modulePath = "/src/views/MemoryGame/utils/captureVideoFrames.ts"
    const { captureVideoFrames } = await import(modulePath)
    const canvas = document.createElement("canvas")
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext("2d")!
    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" })
    const chunks: Blob[] = []
    const colors = ["#ff0000", "#00ff00", "#0000ff"]
    const started = performance.now()
    const draw = () => {
      ctx.fillStyle = colors[Math.min(2, Math.floor((performance.now() - started) / 500))]
      ctx.fillRect(0, 0, 64, 64)
    }
    draw()
    const blob = await new Promise<Blob>((resolve) => {
      recorder.ondataavailable = ({ data }) => {
        if (data.size > 0) chunks.push(data)
      }
      const drawTimer = window.setInterval(draw, 30)
      recorder.onstop = () => {
        window.clearInterval(drawTimer)
        stream.getTracks().forEach((track) => track.stop())
        resolve(new Blob(chunks, { type: recorder.mimeType }))
      }
      recorder.start(100)
      window.setTimeout(() => recorder.stop(), 1500)
    })

    const progress: number[] = []
    // Exercise pausing/resuming when the game takes focus during auto-stop.
    let hidden = false
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
    const hideTimer = window.setTimeout(() => {
      hidden = true
      document.dispatchEvent(new Event("visibilitychange"))
    }, 200)
    const showTimer = window.setTimeout(() => {
      hidden = false
      document.dispatchEvent(new Event("visibilitychange"))
    }, 700)
    const frames: ImageData[] = await captureVideoFrames(blob, {
      fps: 10,
      scaleDown: 1,
      startTime: 0,
      endTime: 1.4,
      onProgress: (current: number, total: number) => progress.push(current / total),
    })
    window.clearTimeout(hideTimer)
    window.clearTimeout(showTimer)
    Reflect.deleteProperty(document, "hidden")
    const sequence = frames.map(({ data }) => {
      const offset = (32 * 64 + 32) * 4
      const rgb = Array.from(data.slice(offset, offset + 3))
      return rgb.indexOf(Math.max(...rgb))
    })
    const transitions = sequence.filter((color, index) => index === 0 || color !== sequence[index - 1])
    return {
      transitions,
      count: frames.length,
      progress,
      hiddenVideoCount: document.querySelectorAll('video[aria-hidden="true"]').length,
    }
  })

  expect(result.transitions).toEqual([0, 1, 2])
  expect(result.count).toBeGreaterThanOrEqual(10)
  expect(result.progress.at(-1)).toBe(1)
  expect(result.progress.every((value, index) => index === 0 || value >= result.progress[index - 1])).toBe(true)
  // Only the app's existing recording-preview video should remain.
  expect(result.hiddenVideoCount).toBe(1)
})
