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
  _itemsCache: new Map(),

  data: {
    loading: true,
    categoryId: "",
    categoryName: "",
    categories: [],
    activeCategoryIndex: 0,
    items: [],
    countText: ""
  },

  onLoad(options) {
    this._navTo = createNavigateOnce(500);
    const categoryId = decodeRouteQueryParam(options.categoryId);
    const categoryName = decodeRouteQueryParam(options.categoryName);
    this.setData({ categoryId, categoryName });
    this.bootstrap();
  },

  async onPullDownRefresh() {
    this._itemsCache = new Map();
    await this.bootstrap({ force: true });
    wx.stopPullDownRefresh();
  },

  async bootstrap({ force = false } = {}) {
    await this.loadCategories();
    await this.ensureActiveCategory({ force });
  },

  async loadCategories() {
    try {
      const res = await db
        .collection("categories")
        .where({ enabled: true })
        .orderBy("sort", "asc")
        .orderBy("createdAt", "desc")
        .limit(200)
        .get();
      this.setData({ categories: res.data || [] });
    } catch (e) {
      this.setData({ categories: [] });
      wx.showToast({ title: "读取分类失败", icon: "none" });
    }
  },

  async ensureActiveCategory({ force = false } = {}) {
    const cats = this.data.categories || [];
    if (!cats.length) {
      this.setData({
        items: [],
        countText: "暂无商品",
        categoryName: "",
        categoryId: "",
        activeCategoryIndex: 0,
        loading: false
      });
      return;
    }

    // 优先：从路由 categoryId 定位；否则默认第一个分类
    const byId = this.data.categoryId
      ? cats.findIndex((c) => c._id === this.data.categoryId)
      : -1;
    const idx = Math.max(0, byId);
    const active = cats[idx];
    const nameRaw = active?.name != null ? String(active.name).trim() : "";
    const name = nameRaw ? decodeRouteQueryParam(nameRaw) : "";
    const nextId = active?._id || "";

    this.setData({
      activeCategoryIndex: idx,
      categoryId: nextId,
      categoryName: name
    });

    await this.loadProductsForCategory(nextId, { force });
  },

  async loadProductsForCategory(categoryId, { force = false } = {}) {
    if (!categoryId) return;
    if (!force && this._itemsCache?.has(categoryId)) {
      const cached = this._itemsCache.get(categoryId) || [];
      this.setData({
        items: cached,
        countText: cached.length ? `共 ${cached.length} 个` : "暂无商品",
        loading: false
      });
      return;
    }

    this.setData({ loading: true });
    try {
      const where = { enabled: true, categoryId };
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
      this._itemsCache.set(categoryId, items);

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

  onPickCategory(e) {
    const idx = Number(e?.currentTarget?.dataset?.idx || 0);
    const cats = this.data.categories || [];
    if (!Number.isFinite(idx) || idx < 0 || idx >= cats.length) return;
    if (idx === this.data.activeCategoryIndex) return;
    const c = cats[idx];
    const nameRaw = c?.name != null ? String(c.name).trim() : "";
    const name = nameRaw ? decodeRouteQueryParam(nameRaw) : "";
    const id = c?._id || "";
    this.setData({
      activeCategoryIndex: idx,
      categoryId: id,
      categoryName: name
    });
    this.loadProductsForCategory(id);
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

