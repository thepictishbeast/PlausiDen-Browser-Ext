/**
 * Pure user-facing error copy for ExtMessage failures.
 *
 * Lives in shared/ (not background/) so tests can import without
 * evaluating the service-worker's top-level chrome.runtime listeners
 * (which only exist inside a running extension, not in Node / tsx).
 *
 * Pattern: what happened (in user terms) / what to try (inline).
 * No "contact support," no stack traces, no internal paths.
 */
export function friendlyErrorFor(messageType: string): string {
  switch (messageType) {
    case "GET_STATS":
      return "Couldn't read activity stats. Try closing and reopening the popup.";
    case "GET_CONFIG":
      return "Couldn't load settings. Your settings are safe — try reopening the popup.";
    case "TOGGLE_ENABLED":
      return "Couldn't toggle protection. Try again in a moment; if it keeps failing, reload the extension from chrome://extensions.";
    case "UPDATE_CONFIG":
      return "Couldn't save that change. The previous settings are still active. Try again, or reload the extension if the error repeats.";
    case "GENERATE_NOW":
      return "Couldn't generate a batch right now. This can happen if the browser is blocking history writes — check your browser's policy or extension settings.";
    case "GET_SELF_CHECK_STATE":
      return "Couldn't read self-check status. The protection loop is still running; reopen this page to retry.";
    case "FORCE_SELF_CHECK":
      return "The self-check probe didn't finish. This can happen if the browser is blocking history writes — try again, or check your browser's extension policy.";
    default:
      return "Something went wrong with that request. Try again; if it repeats, reload the extension.";
  }
}
