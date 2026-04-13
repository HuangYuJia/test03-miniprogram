const db = wx.cloud.database();

export async function isAdmin() {
  try {
    const res = await wx.cloud.callFunction({
      name: "adminCheck",
      data: {}
    });
    const r = res?.result || {};
    return Boolean(r?.isAdmin);
  } catch (e) {
    return false;
  }
}

export async function ensureCollectionsExistHint() {
  // 仅做提示：集合不存在时，很多 API 会报错；这里不强依赖
  try {
    await db.collection("products").limit(1).get();
    await db.collection("categories").limit(1).get();
  } catch (e) {
    // ignore
  }
}

