/**
 * 在 gapMs 内只允许一次 wx.navigateTo，避免连点堆叠多层页面。
 * @param {number} [gapMs=500]
 * @returns {(url: string, extra?: Record<string, unknown>) => void}
 */
export function createNavigateOnce(gapMs = 500) {
  let locked = false;
  return function navigateOnce(url, extra = {}) {
    if (!url || locked) return;
    locked = true;
    const { complete: userComplete, ...rest } = extra;
    wx.navigateTo({
      url,
      ...rest,
      complete: (res) => {
        if (typeof userComplete === "function") userComplete(res);
        setTimeout(() => {
          locked = false;
        }, gapMs);
      }
    });
  };
}
