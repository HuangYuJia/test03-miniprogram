const cache = new Map();
const inflight = new Map();

/** 临时链接着缓存时间不宜过长，否则会一直用到已过期的 URL（列表里表现为 403） */
const CACHE_TTL_MS = 50 * 60 * 1000;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function readCache(id) {
  const hit = cache.get(id);
  if (!hit) return null;
  if (typeof hit === "string") {
    cache.delete(id);
    return null;
  }
  if (!hit.url || Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(id);
    return null;
  }
  return hit.url;
}

function writeCache(id, url) {
  if (id && url) cache.set(id, { url, at: Date.now() });
}

/**
 * 某张图加载失败（如 403）时调用，强制下次重新向云端换链。
 */
export function invalidateTempUrlCache(fileId) {
  if (fileId) cache.delete(fileId);
}

/** 单条 coverFileId 清洗（去空格、兼容非字符串） */
export function normalizeCoverFileId(v) {
  if (v == null || v === "") return "";
  const s = String(v).trim();
  return s || "";
}

/**
 * 商品文档里的 imageFileIds 可能是：数组 / 单个 cloud 字符串 / JSON 字符串 / 导出成的 {0,1,...} 对象
 * 早上「看不见图」有时是历史写入格式异常，这里统一成 string[]。
 */
export function normalizeImageFileIds(doc) {
  const raw = doc?.imageFileIds;
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    if (t.startsWith("cloud://")) return [t];
    try {
      const j = JSON.parse(t);
      if (Array.isArray(j)) {
        return j.map((x) => String(x).trim()).filter(Boolean);
      }
    } catch (e) {
      /* ignore */
    }
    return [];
  }
  if (typeof raw === "object") {
    return Object.values(raw)
      .map((x) => String(x).trim())
      .filter((x) => x.startsWith("cloud://"));
  }
  return [];
}

/** 详情轮播用：优先完整 imageFileIds，否则退回单张 coverFileId */
export function allImageFileIdsForProduct(doc) {
  const ids = normalizeImageFileIds(doc);
  if (ids.length) return ids;
  const c = normalizeCoverFileId(doc?.coverFileId);
  return c ? [c] : [];
}

/** 列表封面 cloud:// fileId：优先 coverFileId，否则首张图 */
export function resolveCoverFileId(doc) {
  if (!doc) return "";
  const c = normalizeCoverFileId(doc.coverFileId);
  if (c) return c;
  const ids = normalizeImageFileIds(doc);
  return ids[0] || "";
}

/**
 * `<image>` 的 src 只用 https。
 * 勿把 cloud:// 填进 src：在搜索/列表等页会被当成相对路径，变成 `/pages/xxx/cloud://...` 导致 500。
 * 注意：getTempFileURL 返回的合法临时链也是 `tcb.qcloud.la` 域名，必须与库里「仅作缓存、可能已过期」的旧链区分——
 * hydrate 成功后写入的 coverUrl 一律视为可用 https，不可因域名而清空。
 */
export function assignCoverDisplaySrc(p) {
  if (!p) return;
  const u = p.coverUrl;
  if (u && String(u).startsWith("https://")) {
    p.coverDisplaySrc = u;
    return;
  }
  p.coverDisplaySrc = "";
}

/**
 * 列表/管理页：用 fileId 换最新临时链写入 coverUrl（仅 https 再给 image 用）。
 */
export async function hydrateCoverUrls(items) {
  const list = items || [];
  const ids = [...new Set(list.map(resolveCoverFileId).filter(Boolean))];
  if (ids.length) {
    const map = await getTempUrls(ids);
    for (const p of list) {
      const fid = resolveCoverFileId(p);
      if (!fid) continue;
      const u = map.get(fid);
      if (u) p.coverUrl = u;
      else p.coverUrl = "";
    }
  }
  for (const p of list) assignCoverDisplaySrc(p);
}

/**
 * 通过云存储 fileID 获取可访问的临时 URL（带短时缓存）。
 * tempFileURL 会过期，所以展示时建议实时换取。
 */
export async function getTempUrls(fileIds) {
  const ids = Array.from(
    new Set(
      (fileIds || [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  );
  if (!ids.length) return new Map();

  const result = new Map();
  const need = [];

  for (const id of ids) {
    const url = readCache(id);
    if (url) {
      result.set(id, url);
    } else {
      need.push(id);
    }
  }

  if (!need.length) return result;

  // 合并并发：同一个 id 只请求一次
  const pending = [];
  for (const id of need) {
    const p = inflight.get(id);
    if (p) {
      pending.push(p.then((url) => result.set(id, url)));
    }
  }
  if (pending.length) await Promise.allSettled(pending);

  const need2 = need.filter((id) => !result.get(id) && !inflight.get(id));
  if (!need2.length) return result;

  async function fetchTempFileList(fileList) {
    try {
      const cf = await wx.cloud.callFunction({
        name: "tempFileUrls",
        data: { fileList }
      });
      const list = cf?.result?.fileList || [];
      if (list.some((x) => x.tempFileURL)) return list;
    } catch (e) {
      /* 云函数未部署等 */
    }
    try {
      const res = await wx.cloud.getTempFileURL({ fileList });
      return res?.fileList || [];
    } catch (e2) {
      return [];
    }
  }

  // 云接口一次最多 50 个；优先云函数换链，避免客户端 STORAGE_EXCEED_AUTHORITY
  for (const group of chunk(need2, 50)) {
    const batchProm = fetchTempFileList(group);
    for (const id of group) {
      inflight.set(
        id,
        batchProm
          .then((list) => {
            const found = list.find((x) => x.fileID === id);
            const url = found?.tempFileURL || "";
            if (url) writeCache(id, url);
            return url;
          })
          .finally(() => inflight.delete(id))
      );
    }

    const list = await batchProm;
    for (const it of list) {
      if (it?.errMsg) {
        console.warn("[getTempFileURL]", it.fileID, it.errMsg);
      }
      if (it?.fileID && it?.tempFileURL) {
        writeCache(it.fileID, it.tempFileURL);
        result.set(it.fileID, it.tempFileURL);
      }
    }
  }

  return result;
}

