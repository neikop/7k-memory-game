import { type RefObject, useCallback, useEffect, useRef, useState } from "react"
import { createMediaRecorderSession } from "../utils"

type UseRecordingControllerArgs = {
  autoStopEnabled: boolean
  autoStopSeconds?: number
  onRecordedBlob: (blob: Blob) => void
  onError?: (error: ErrorNotice) => void
}

type UseRecordingControllerResult = {
  downloadRecordedVideo: () => void
  hasActiveShare: boolean
  hiddenPreviewVideoRef: RefObject<HTMLVideoElement | null>
  isConnecting: boolean
  isRecording: boolean
  recordedVideoUrl: string | null
  recordingSeconds: number
  sidebarPreviewVideoRef: RefObject<HTMLVideoElement | null>
  startRecording: () => Promise<void>
  stopRecording: () => void
  toggleShareConnection: () => void
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return "Unknown error"
}
const RECORDING_TIMESLICE_MS = 250

export const useRecordingController = ({
  autoStopEnabled,
  autoStopSeconds = 5,
  onRecordedBlob,
  onError,
}: UseRecordingControllerArgs): UseRecordingControllerResult => {
  const [hasActiveShare, setHasActiveShare] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null)
  const [recordedVideoFileName, setRecordedVideoFileName] = useState("memory-game-recording.mp4")

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const hiddenPreviewVideoRef = useRef<HTMLVideoElement | null>(null)
  const sidebarPreviewVideoRef = useRef<HTMLVideoElement | null>(null)
  const recordedVideoUrlRef = useRef<string | null>(null)

  const releaseRecordedVideoUrl = useCallback(() => {
    if (!recordedVideoUrlRef.current) {
      return
    }

    URL.revokeObjectURL(recordedVideoUrlRef.current)
    recordedVideoUrlRef.current = null
  }, [])

  const clearRecordedVideoUrl = useCallback(() => {
    releaseRecordedVideoUrl()
    setRecordedVideoUrl(null)
  }, [releaseRecordedVideoUrl])

  const emitError = useCallback(
    (title: string, description: string) => {
      onError?.({ title, description })
    },
    [onError],
  )

  const reportError = useCallback(
    (title: string, error: unknown) => {
      emitError(title, getErrorMessage(error))
    },
    [emitError],
  )

  const setRecordedVideoBlob = useCallback(
    (blob: Blob, extension: "mp4" | "webm") => {
      clearRecordedVideoUrl()

      const nextUrl = URL.createObjectURL(blob)
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
      recordedVideoUrlRef.current = nextUrl
      setRecordedVideoUrl(nextUrl)
      setRecordedVideoFileName(`memory-game-recording-${timestamp}.${extension}`)
    },
    [clearRecordedVideoUrl],
  )

  const attachPreviewStream = useCallback(async (stream: MediaStream | null) => {
    const attachToVideo = async (video: HTMLVideoElement | null) => {
      if (!video) {
        return
      }

      video.srcObject = stream

      if (stream) {
        try {
          await video.play()
        } catch {
          // Ignore autoplay rejections. Preview should not block capture flow.
        }
      }
    }

    await attachToVideo(hiddenPreviewVideoRef.current)
    await attachToVideo(sidebarPreviewVideoRef.current)
  }, [])

  const stopRecordingStream = useCallback(() => {
    if (!recordingStreamRef.current) {
      return
    }

    recordingStreamRef.current.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
    mediaRecorderRef.current = null
  }, [])

  const stopRecorder = useCallback((syncUiState: boolean) => {
    if (mediaRecorderRef.current?.state !== "recording") {
      return
    }

    try {
      mediaRecorderRef.current.requestData()
    } catch {
      // Ignore flush failures and still stop recorder.
    }

    mediaRecorderRef.current.stop()
    if (syncUiState) {
      setIsRecording(false)
    }
  }, [])

  const stopRecording = useCallback(() => {
    stopRecorder(true)
  }, [stopRecorder])

  const clearShareState = useCallback(() => {
    setHasActiveShare(false)
    setRecordingSeconds(0)
    void attachPreviewStream(null)
  }, [attachPreviewStream])

  const stopSharing = useCallback(() => {
    if (!streamRef.current) {
      return
    }

    streamRef.current.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    clearShareState()
  }, [clearShareState])

  const disconnectShare = useCallback(() => {
    stopRecording()
    stopRecordingStream()
    stopSharing()
  }, [stopRecording, stopRecordingStream, stopSharing])

  const ensureCaptureStream = useCallback(async () => {
    const currentStream = streamRef.current
    const currentTrack = currentStream?.getVideoTracks()[0]

    if (currentStream && currentTrack && currentTrack.readyState === "live") {
      return currentStream
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    })

    streamRef.current = stream
    setHasActiveShare(true)
    void attachPreviewStream(stream)

    const videoTrack = stream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.addEventListener(
        "ended",
        () => {
          streamRef.current = null
          clearShareState()
          stopRecording()
        },
        { once: true },
      )
    }

    return stream
  }, [attachPreviewStream, clearShareState, stopRecording])

  const connectShare = useCallback(async () => {
    try {
      setIsConnecting(true)
      await ensureCaptureStream()
    } catch (error) {
      reportError("Window Connection Failed", error)
    } finally {
      setIsConnecting(false)
    }
  }, [ensureCaptureStream, reportError])

  const startRecording = useCallback(async () => {
    try {
      const existingRecorder = mediaRecorderRef.current
      if (existingRecorder && existingRecorder.state !== "inactive") {
        return
      }

      const captureStream = streamRef.current
      const captureTrack = captureStream?.getVideoTracks()[0]
      if (!captureStream || !captureTrack || captureTrack.readyState !== "live") {
        setHasActiveShare(false)
        emitError("Recording Unavailable", "Please connect your game window first.")
        return
      }

      const captureVideoTrack = captureStream.getVideoTracks()[0]
      if (!captureVideoTrack) {
        throw new Error("No captured video track available")
      }

      const { mediaRecorder, recordingStream } = createMediaRecorderSession({
        captureTrack: captureVideoTrack,
        onError: () => {
          emitError("Recording Error", "An error occurred while capturing video. Please try again.")
        },
        onStop: ({ blob, extension }) => {
          stopRecordingStream()

          if (blob.size > 0) {
            setRecordedVideoBlob(blob, extension)
            onRecordedBlob(blob)
            return
          }

          emitError("Empty Recording", "Recorded video has no data. Please try again.")
        },
      })

      recordingStreamRef.current = recordingStream
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.start(RECORDING_TIMESLICE_MS)
      setRecordingSeconds(0)
      setIsRecording(true)
    } catch (error) {
      reportError("Recording Failed", error)
    }
  }, [emitError, onRecordedBlob, reportError, setRecordedVideoBlob, stopRecordingStream])

  const downloadRecordedVideo = useCallback(() => {
    if (!recordedVideoUrl) {
      return
    }

    const anchor = document.createElement("a")
    anchor.href = recordedVideoUrl
    anchor.download = recordedVideoFileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }, [recordedVideoFileName, recordedVideoUrl])

  const toggleShareConnection = useCallback(() => {
    if (hasActiveShare) {
      disconnectShare()
      return
    }

    void connectShare()
  }, [connectShare, disconnectShare, hasActiveShare])

  useEffect(() => {
    if (!isRecording) {
      return
    }

    const timerId = window.setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1)
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [isRecording])

  useEffect(() => {
    if (!isRecording || !autoStopEnabled || recordingSeconds < autoStopSeconds) {
      return
    }

    stopRecording()
  }, [autoStopEnabled, autoStopSeconds, isRecording, recordingSeconds, stopRecording])

  useEffect(() => {
    if (!streamRef.current) {
      return
    }

    void attachPreviewStream(streamRef.current)
  }, [attachPreviewStream, hasActiveShare])

  useEffect(() => {
    const hiddenPreviewVideo = hiddenPreviewVideoRef.current
    const sidebarPreviewVideo = sidebarPreviewVideoRef.current

    return () => {
      stopRecorder(false)
      stopRecordingStream()

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      if (hiddenPreviewVideo) {
        hiddenPreviewVideo.srcObject = null
      }

      if (sidebarPreviewVideo) {
        sidebarPreviewVideo.srcObject = null
      }

      releaseRecordedVideoUrl()
    }
  }, [releaseRecordedVideoUrl, stopRecorder, stopRecordingStream])

  return {
    downloadRecordedVideo,
    hasActiveShare,
    hiddenPreviewVideoRef,
    isConnecting,
    isRecording,
    recordedVideoUrl,
    recordingSeconds,
    sidebarPreviewVideoRef,
    startRecording,
    stopRecording,
    toggleShareConnection,
  }
}
