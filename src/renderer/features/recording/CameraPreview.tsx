import { useEffect, useRef } from 'react'

export function CameraPreview({ stream }: { stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  if (!stream) {
    return <div className="camera-preview camera-preview--empty">Selecione uma camera</div>
  }

  return <video ref={videoRef} className="camera-preview" autoPlay muted playsInline />
}
