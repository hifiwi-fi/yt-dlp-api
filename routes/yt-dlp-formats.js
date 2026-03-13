/**
 * Maps the API's `format` parameter ('audio' | 'video') to yt-dlp format selection strings.
 * Used by both the /unified and /discover routes when proxying to the Python yt-dlp server.
 *
 * @type {{ audio: string, video: string }}
 */
export const ytDlpFormats = /** @type {const} */ ({
  audio: 'ba[ext=m4a]/ba[ext=mp4]/ba[ext=mp3]/mp3/m4a',
  video: 'best[ext=mp4]/best[ext=mov]/mp4/mov'
})
