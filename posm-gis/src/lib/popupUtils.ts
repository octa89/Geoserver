/**
 * Escape a string for safe inclusion in HTML by leveraging the browser DOM.
 * Uses the textContent/innerHTML trick: assign as text, read back as markup.
 */
export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff?|avif)(\?.*)?$/i;

/**
 * Return true if the URL ends with a recognised image file extension.
 */
export function isImageUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return IMAGE_EXTENSIONS.test(pathname);
  } catch {
    // Not a valid URL
    return IMAGE_EXTENSIONS.test(url);
  }
}

/**
 * Return true if the string is an absolute http or https URL.
 */
export function isUrl(str: string): boolean {
  if (typeof str !== 'string') return false;
  return /^https?:\/\//i.test(str.trim());
}

/**
 * Format a feature property value for popup display:
 * - Image URLs -> <img> tag
 * - Other URLs -> <a> anchor tag (opens in new tab)
 * - Everything else -> HTML-escaped plain text
 */
export function formatPopupValue(val: unknown): string {
  if (val === null || val === undefined) return '';

  const str = String(val);
  if (!isUrl(str)) return escapeHtml(str);

  const escaped = escapeHtml(str);

  if (isImageUrl(str)) {
    return `<a href="${escaped}" target="_blank" rel="noopener"><img src="${escaped}" class="popup-img" alt="image" /></a>`;
  }

  // Truncate long URLs for display
  const display = str.length > 50 ? str.substring(0, 47) + '...' : str;
  return `<a href="${escaped}" target="_blank" rel="noopener" class="popup-link">${escapeHtml(display)}</a>`;
}

/**
 * Sort the keys of a properties object for popup display:
 * 1. Fields whose value is an image URL (visual preview first)
 * 2. Fields whose value is a non-image URL
 * 3. All remaining fields, alphabetically
 */
export function smartSortFields(props: Record<string, unknown>): string[] {
  const imageFields: string[] = [];
  const linkFields: string[] = [];
  const otherFields: string[] = [];

  for (const key of Object.keys(props)) {
    const val = props[key];
    const str = val !== null && val !== undefined ? String(val) : '';

    if (isUrl(str) && isImageUrl(str)) {
      imageFields.push(key);
    } else if (isUrl(str)) {
      linkFields.push(key);
    } else {
      otherFields.push(key);
    }
  }

  const cmp = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' });

  return [
    ...imageFields.sort(cmp),
    ...linkFields.sort(cmp),
    ...otherFields.sort(cmp),
  ];
}
