/**
 * Normalizes URL-like values returned by yt-dlp before they are serialized
 * through JSON schema fields declared with `format: uri`.
 *
 * yt-dlp extractors sometimes use browser-only placeholders like `#` for
 * profile or channel links. Those are valid HTML hrefs, but they are not valid
 * absolute URIs and fast-json-stringify throws while serializing them.
 *
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function normalizeYtDlpUri (value) {
  if (!value) return null

  return URL.canParse(value) ? value : null
}
