/**
 * Note images are stored inline in the note's HTML as base64 data URLs, so a
 * single large photo would bloat every save of that note. The backend caps a
 * note's total size (NOTE_CONTENT_MAX in kanso-backend/app/schemas/limits.py);
 * capping each image well below that keeps notes with a few images saveable.
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const IMAGE_TOO_LARGE_MESSAGE = 'Images must be under 2 MB. Try a smaller or compressed copy.';
