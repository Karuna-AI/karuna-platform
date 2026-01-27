/**
 * Web mock for expo-clipboard
 */

export async function setStringAsync(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

export async function getStringAsync(): Promise<string> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}

export async function hasStringAsync(): Promise<boolean> {
  try {
    const text = await navigator.clipboard.readText();
    return text.length > 0;
  } catch {
    return false;
  }
}

export async function setString(text: string): Promise<void> {
  await setStringAsync(text);
}

export async function getString(): Promise<string> {
  return getStringAsync();
}

export default {
  setStringAsync,
  getStringAsync,
  hasStringAsync,
  setString,
  getString,
};
