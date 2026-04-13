const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function requireAdmin(openid) {
  if (openid) {
    const resByOpenid = await db
      .collection("admins")
      .where({ openid })
      .limit(1)
      .get();
    if (resByOpenid.data && resByOpenid.data.length) return;
  }

  const err = new Error("forbidden");
  err.code = "FORBIDDEN";
  throw err;
}

async function fileIdsToUrls(fileIds) {
  const ids = (fileIds || []).filter(Boolean);
  if (!ids.length) return [];
  const r = await cloud.getTempFileURL({ fileList: ids });
  const list = r.fileList || [];
  // 保持顺序：按 ids 顺序取 matching
  const map = new Map(list.map((x) => [x.fileID, x.tempFileURL]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid =
    wxContext.OPENID || wxContext.openid || wxContext.wxopenid || null;
  await requireAdmin(openid);

  const { id, doc } = event || {};
  if (!doc) throw new Error("missing doc");

  const name = String(doc.name || "").trim();
  if (!name) throw new Error("missing name");

  const categoryId = String(doc.categoryId || "").trim();
  if (!categoryId) throw new Error("missing categoryId");

  const price = Number(doc.price);
  if (!Number.isFinite(price) || price < 0) throw new Error("invalid price");

  const imageFileIds = Array.isArray(doc.imageFileIds) ? doc.imageFileIds : [];
  if (!imageFileIds.length) throw new Error("missing images");

  const imageUrls = await fileIdsToUrls(imageFileIds);
  const coverFileId = imageFileIds[0];
  const coverUrl = imageUrls[0] || "";

  const payload = {
    name,
    categoryId,
    price: Math.round(price),
    unit: String(doc.unit || "").trim(),
    // 新字段启用后清空旧字段，避免客户端回显兜底到旧 yearMonth
    yearMonth: "",
    year: (() => {
      const v = String(doc.year || "").trim();
      return /^\d{4}$/.test(v) ? v : "";
    })(),
    month: (() => {
      const v = String(doc.month || "").trim();
      return /^(0[1-9]|1[0-2])$/.test(v) ? v : "";
    })(),
    // 兼容旧字段：若仍传 yearMonth，则用于补齐 year/month（但不强制写入 yearMonth）
    ...(String(doc.yearMonth || "").trim().match(/^(\d{4})-(\d{2})$/)
      ? (() => {
          const m = String(doc.yearMonth || "")
            .trim()
            .match(/^(\d{4})-(\d{2})$/);
          const y = m ? m[1] : "";
          const mo = m ? m[2] : "";
          const docYear = String(doc.year || "").trim();
          const docMonth = String(doc.month || "").trim();
          return {
            year: /^\d{4}$/.test(docYear) ? docYear : y,
            month: /^(0[1-9]|1[0-2])$/.test(docMonth) ? docMonth : mo
          };
        })()
      : {}),
    tags: Array.isArray(doc.tags)
      ? doc.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 10)
      : [],
    desc: String(doc.desc || "").trim(),
    enabled: doc.enabled !== false,
    sort: Number(doc.sort || 0),

    coverFileId,
    coverUrl,
    imageFileIds,
    imageUrls,

    updatedAt: Date.now()
  };

  if (id) {
    await db.collection("products").doc(id).update({ data: payload });
    return { id };
  }

  const createdAt = Date.now();
  const addRes = await db.collection("products").add({
    data: { ...payload, createdAt }
  });
  return { id: addRes._id };
};

