/** Keep render recovery from aborting a request before the SDK's deadline. */
export const SDK_REQUEST_TIMEOUT_MS = 60_000;
export const SCENE_REQUEST_GRACE_MS = SDK_REQUEST_TIMEOUT_MS + 5_000;
