import type { MeetingStudioApi } from '@shared/types/preload-api'

declare global {
  interface Window {
    meetingStudio: MeetingStudioApi
  }
}

export {}
