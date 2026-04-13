/**
 * 解码小程序路由 query 中的参数：兼容多次 encode、全角「%」等。
 * 单次 decode 无法还原「对已含 %XX 的字符串再次 encode」的情况。
 */
export function decodeRouteQueryParam(v) {
  if (v == null || v === "") return "";
  let s = String(v).replace(/\uFF05/g, "%");
  for (let i = 0; i < 5; i += 1) {
    if (!/%[0-9A-Fa-f]{2}/.test(s)) break;
    try {
      const next = decodeURIComponent(s.replace(/\+/g, " "));
      if (next === s) break;
      s = next;
    } catch (e) {
      break;
    }
  }
  return s;
}
