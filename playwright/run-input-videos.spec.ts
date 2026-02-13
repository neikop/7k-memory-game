import fs from "node:fs/promises"
import path from "node:path"
import { expect, test } from "@playwright/test"

const INPUT_DIR = path.resolve("artifacts/input")
const OUTPUT_ROOT_DIR = path.resolve("artifacts/output")
const RESULT_IMAGE_ALT = "Merged memory-game solution"
const DEFAULT_PER_FILE_PROCESS_TIMEOUT_MS = 60_000

const withTimeout = async <T>(operation: () => Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(message))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

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
  const perFileProcessTimeoutMs = DEFAULT_PER_FILE_PROCESS_TIMEOUT_MS

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
    const timeoutMessage = `Processing timed out after ${perFileProcessTimeoutMs}ms for ${fileName}`

    await withTimeout(
      async () => {
        await page.setInputFiles(fileInputSelector, fullInputPath)
        await expect(resultImage).toBeVisible({ timeout: perFileProcessTimeoutMs })

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
        await expect(resultImage).toBeHidden({ timeout: Math.min(10_000, perFileProcessTimeoutMs) })
      },
      perFileProcessTimeoutMs,
      timeoutMessage,
    )
  }

  console.log(`Run output directory: ${outputDir}`)
})
