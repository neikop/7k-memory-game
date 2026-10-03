import { expect, test } from "@playwright/test"

for (const introSeconds of [0, 1, 2]) {
  test(`preserves all 24 faces with a ${introSeconds}s intro and an isolated first reveal`, async ({ page }) => {
    await page.goto("/")
    const result = await page.evaluate(async (introSeconds) => {
      const modulePath = "/src/views/MemoryGame/utils/processVideoToImage.ts"
      const { processVideoFramesToImage } = await import(modulePath)
      const canvas = document.createElement("canvas")
      canvas.width = 640
      canvas.height = 360
      const ctx = canvas.getContext("2d")!
      const backColor = "#151a25"
      const layout = { left: 0.07525, top: 0.2295, width: 0.092, height: 0.22425, gapX: 0.01625, gapY: 0.02775 }
      const cells = Array.from({ length: 24 }, (_, index) => {
        const left = Math.round((layout.left + (index % 8) * (layout.width + layout.gapX)) * canvas.width)
        const right = Math.round(
          (layout.left + (index % 8) * (layout.width + layout.gapX) + layout.width) * canvas.width,
        )
        const top = Math.round((layout.top + Math.floor(index / 8) * (layout.height + layout.gapY)) * canvas.height)
        const bottom = Math.round(
          (layout.top + Math.floor(index / 8) * (layout.height + layout.gapY) + layout.height) * canvas.height,
        )
        return {
          left,
          top,
          width: right - left,
          height: bottom - top,
          color: [90 + index * 5, 80 + (index % 7) * 18, 130 + (index % 5) * 20],
        }
      })
      const frames: ImageData[] = []
      const drawFrame = (revealed: number[], intro = false, overlay = false) => {
        ctx.fillStyle = "#101319"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        for (const cell of cells) {
          ctx.fillStyle = backColor
          ctx.fillRect(cell.left, cell.top, cell.width, cell.height)
        }
        for (const index of revealed) {
          const cell = cells[index]
          // A small face region ensures one card changes less than the old
          // whole-screen minimum. Multiple later cards still exceed that minimum.
          ctx.fillStyle = `rgb(${cell.color.join(",")})`
          ctx.fillRect(
            cell.left + cell.width * 0.15,
            cell.top + cell.height * 0.15,
            cell.width * 0.45,
            cell.height * 0.7,
          )
          ctx.fillStyle = "white"
          ctx.fillRect(cell.left + cell.width * 0.5, cell.top + cell.height * 0.2, cell.width * 0.1, cell.height * 0.25)
          ctx.fillStyle = "black"
          ctx.fillRect(
            cell.left + cell.width * 0.5,
            cell.top + cell.height * 0.55,
            cell.width * 0.1,
            cell.height * 0.25,
          )
          ctx.fillStyle = "white"
          ctx.fillRect(cell.left + cell.width * 0.7, cell.top + cell.height * 0.2, 3, cell.height * 0.6)
        }
        if (intro) {
          ctx.fillStyle = frames.length % 2 === 0 ? "#ffcc00" : "#ff8800"
          ctx.font = "bold 22px sans-serif"
          ctx.fillText(frames.length < introSeconds * 5 ? "Ready" : "Start", 275, 45)
        }
        if (overlay) {
          ctx.fillStyle = "#eeeeee"
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = "black"
          ctx.font = "bold 40px sans-serif"
          ctx.fillText("START", 250, 180)
        }
        frames.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
      }
      for (let index = 0; index < introSeconds * 10; index++) drawFrame([], true)
      // Card zero opens by itself, before four seconds, followed by an idle gap.
      for (let index = 0; index < 2; index++) drawFrame([0])
      // A dimmer later candidate has a spurious bright mark in an otherwise
      // unchanged part of the card. The winning face must remain one coherent image.
      const firstCell = cells[0]
      for (let index = 0; index < 3; index++) {
        drawFrame([0])
        ctx.fillStyle = "rgb(60,65,100)"
        ctx.fillRect(
          firstCell.left + firstCell.width * 0.15,
          firstCell.top + firstCell.height * 0.15,
          firstCell.width * 0.45,
          firstCell.height * 0.7,
        )
        ctx.fillStyle = "white"
        ctx.fillRect(firstCell.left + firstCell.width * 0.8, firstCell.top + firstCell.height * 0.45, 6, 6)
        frames[frames.length - 1] = ctx.getImageData(0, 0, canvas.width, canvas.height)
      }
      for (let index = 0; index < 6; index++) drawFrame([])
      // An intro/transition screen must not become the selected board content.
      for (let index = 0; index < 3; index++) drawFrame([], false, true)
      for (let first = 1; first < 24; first += 3) {
        const group = [first, first + 1, first + 2].filter((index) => index < 24)
        for (let index = 0; index < 3; index++) drawFrame(group)
      }
      for (let index = 0; index < 3; index++) drawFrame([])

      const png = await processVideoFramesToImage(frames)
      const image = new Image()
      image.src = png
      await image.decode()
      ctx.drawImage(image, 0, 0)
      const colors = cells.map((cell) => {
        const actual = Array.from(
          ctx
            .getImageData(Math.floor(cell.left + cell.width * 0.35), Math.floor(cell.top + cell.height * 0.5), 1, 1)
            .data.slice(0, 3),
        )
        return { actual, expected: cell.color }
      })
      return {
        colors,
        background: Array.from(ctx.getImageData(320, 45, 1, 1).data.slice(0, 3)),
        cleanCardPixel: Array.from(
          ctx
            .getImageData(
              Math.floor(firstCell.left + firstCell.width * 0.8) + 3,
              Math.floor(firstCell.top + firstCell.height * 0.45) + 3,
              1,
              1,
            )
            .data.slice(0, 3),
        ),
      }
    }, introSeconds)

    for (let index = 0; index < result.colors.length; index++) {
      const { actual, expected } = result.colors[index]
      expect(actual, `card ${index + 1} should retain its revealed face`).toEqual(expected)
    }
    expect(result.background).toEqual([16, 19, 25])
    expect(result.cleanCardPixel).toEqual([21, 26, 37])
  })
}
