import { centsToYuanText } from "../../utils/money";
import { createNavigateOnce } from "../../utils/navGuard";
import { decodeRouteQueryParam } from "../../utils/queryDecode";
import {
  getTempUrls,
  hydrateCoverUrls,
  invalidateTempUrlCache,
  resolveCoverFileId
} from "../../utils/fileUrl";

const db = wx.cloud.database();

function yearTextFromProduct(p) {
  const y = String(p?.year || "").trim();
  if (/^\d{4}$/.test(y)) return y;
  const ym = String(p?.yearMonth || "").trim();
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  return m ? m[1] : "";
}

Page({
  data: {
    loading: true,
    categoryId: "",
    categoryName: "",
    items: [],
    countText: ""
  },

  onLoad(options) {
    this._navTo = createNavigateOnce(500);
    const categoryId = decodeRouteQueryParam(options.categoryId);
    const categoryName = decodeRouteQueryParam(options.categoryName);
    this.setData({ categoryId, categoryName });
    this.load();
    this.fetchCategoryDisplayName();
  },

  async onPullDownRefresh() {
    await Promise.all([this.load(), this.fetchCategoryDisplayName()]);
    wx.stopPullDownRefresh();
  },

  /** 标题以云端分类名为准，避免 URL 双重编码或框架解码差异导致显示 %E5%… */
  async fetchCategoryDisplayName() {
    const id = this.data.categoryId;
    if (!id) return;
    try {
      const res = await db.collection("categories").doc(id).get();
      const doc = res.data;
      const raw = doc && doc.name != null ? String(doc.name).trim() : "";
      const name = raw ? decodeRouteQueryParam(raw) : "";
      if (name) this.setData({ categoryName: name });
    } catch (e) {
      // 保留 onLoad 里从 query 解码得到的标题
    }
  },

  async load() {
    this.setData({ loading: true });
    try {
      const where = { enabled: true };
      if (this.data.categoryId) where.categoryId = this.data.categoryId;

      const res = await db
        .collection("products")
        .where(where)
        .orderBy("sort", "asc")
        .orderBy("updatedAt", "desc")
        .get();

      const items = (res.data || []).map((p) => ({
        ...p,
        coverUrl: p.coverUrl || "",
        coverFileId: resolveCoverFileId(p),
        priceText: centsToYuanText(p.price),
        yearText: yearTextFromProduct(p)
      }));

      await hydrateCoverUrls(items);

      this.setData({
        items,
        countText: items.length ? `共 ${items.length} 个` : "暂无商品"
      });
    } catch (e) {
      wx.showToast({ title: "读取商品失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  goSearch() {
    this._navTo("/pages/search/search");
  },

  goDetail(e) {
    const id = e?.currentTarget?.dataset?.id;
    if (!id) return;
    this._navTo(`/pages/detail/detail?id=${encodeURIComponent(id)}`);
  },

  async onCoverError(e) {
    const idx = Number(e?.currentTarget?.dataset?.idx);
    let fileid = e?.currentTarget?.dataset?.fileid;
    if (!Number.isFinite(idx) || idx < 0) return;
    if (!fileid && this.data.items[idx]) {
      fileid = resolveCoverFileId(this.data.items[idx]);
    }
    if (!fileid) return;

    try {
      invalidateTempUrlCache(fileid);
      const map = await getTempUrls([fileid]);
      const url = map.get(fileid) || "";
      if (url) {
        this.setData({
          [`items[${idx}].coverUrl`]: url,
          [`items[${idx}].coverDisplaySrc`]: url
        });
      }
    } catch (err) {
      // ignore
    }
  }
});

