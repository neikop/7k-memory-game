import fs from "node:fs/promises"
import path from "node:path"
import { expect, test } from "@playwright/test"

const INPUT_DIR = path.resolve("artifacts/input")
const OUTPUT_ROOT_DIR = path.resolve("artifacts/output")
const RESULT_IMAGE_ALT = "Merged memory-game solution"

const formatRunTimestamp = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0")

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("")
}

test("processes all videos in artifacts/input and exports png outputs in a timestamped folder", async ({ page }) => {
  const entries = await fs.readdir(INPUT_DIR, { withFileTypes: true })
  const videoFiles = entries
    .filter((entry) => entry.isFile() && /\.(mp4|webm|mov|mkv)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort()

  expect(videoFiles.length).toBeGreaterThan(0)

  const runFolderName = formatRunTimestamp(new Date())
  const outputDir = path.join(OUTPUT_ROOT_DIR, runFolderName)
  await fs.mkdir(outputDir, { recursive: true })

  await page.goto("/")

  const fileInputSelector = 'input[type="file"]'
  const resultImage = page.getByAltText(RESULT_IMAGE_ALT)
  const clearResultButton = page.getByRole("button", { name: "Clear" })

  for (let index = 0; index < videoFiles.length; index += 1) {
    const fileName = videoFiles[index]
    const fullInputPath = path.join(INPUT_DIR, fileName)

    await page.setInputFiles(fileInputSelector, fullInputPath)
    await expect(resultImage).toBeVisible({ timeout: 10 * 60 * 1000 })

    const src = await resultImage.getAttribute("src")
    if (!src || !src.startsWith("data:image/png;base64,")) {
      throw new Error(`Result image for ${fileName} is missing or not a PNG data URL.`)
    }

    const outputFileName = `${path.parse(fileName).name}.png`
    const outputFilePath = path.join(outputDir, outputFileName)
    const base64Data = src.replace("data:image/png;base64,", "")
    await fs.writeFile(outputFilePath, Buffer.from(base64Data, "base64"))

    console.log(`[${index + 1}/${videoFiles.length}] Saved ${outputFileName}`)

    await clearResultButton.click()
    await expect(resultImage).toBeHidden()
  }

  console.log(`Run output directory: ${outputDir}`)
})
