type RecorderFileExtension = "mp4" | "webm"

type RecorderStopPayload = {
  blob: Blob
  extension: RecorderFileExtension
}

type CreateMediaRecorderSessionArgs = {
  captureTrack: MediaStreamTrack
  onError: () => void
  onStop: (payload: RecorderStopPayload) => void
}

type RecordingSession = {
  mediaRecorder: MediaRecorder
  recordingStream: MediaStream
}

const MP4_MIME_CANDIDATES = ["video/mp4"]
const WEBM_MIME_CANDIDATES = ["video/webm"]

const pickSupportedMimeType = (candidates: string[]): string | null =>
  candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null

const getFileExtensionFromMimeType = (mimeType: string): RecorderFileExtension =>
  mimeType.includes("mp4") ? "mp4" : "webm"

const createMediaRecorder = (stream: MediaStream, mimeType: string | null): MediaRecorder => {
  try {
    return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  } catch {
    return new MediaRecorder(stream)
  }
}

export const createMediaRecorderSession = ({
  captureTrack,
  onError,
  onStop,
}: CreateMediaRecorderSessionArgs): RecordingSession => {
  const recordingStream = new MediaStream([captureTrack.clone()])
  const mp4MimeType = pickSupportedMimeType(MP4_MIME_CANDIDATES)
  const fallbackMimeType = pickSupportedMimeType(WEBM_MIME_CANDIDATES)
  const selectedMimeType = mp4MimeType ?? fallbackMimeType
  const mediaRecorder = createMediaRecorder(recordingStream, selectedMimeType)
  const chunks: Blob[] = []

  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      chunks.push(event.data)
    }
  }

  mediaRecorder.onerror = () => {
    onError()
  }

  mediaRecorder.onstop = () => {
    const outputMimeType = mediaRecorder.mimeType || selectedMimeType || "video/webm"
    const blob = new Blob(chunks, { type: outputMimeType })

    onStop({
      blob,
      extension: getFileExtensionFromMimeType(outputMimeType),
    })
  }

  return {
    mediaRecorder,
    recordingStream,
  }
}
