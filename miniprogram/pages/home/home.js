import { isAdmin, ensureCollectionsExistHint } from "../../utils/admin";
import { createNavigateOnce } from "../../utils/navGuard";

const db = wx.cloud.database();

Page({
  data: {
    loading: true,
    categories: [],
    isAdmin: false
  },

  async onLoad() {
    this._navTo = createNavigateOnce(500);
    await ensureCollectionsExistHint();
    await this.refreshAdmin();
    await this.loadCategories();
  },

  async onShow() {
    // 返回首页时刷新一次
    await this.loadCategories();
  },

  async refreshAdmin() {
    const ok = await isAdmin();
    this.setData({ isAdmin: ok });
  },

  async loadCategories() {
    this.setData({ loading: true });
    try {
      const res = await db
        .collection("categories")
        .where({ enabled: true })
        .orderBy("sort", "asc")
        .orderBy("createdAt", "desc")
        .get();

      this.setData({ categories: res.data || [] });
    } catch (e) {
      wx.showToast({ title: "读取分类失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  goCategory(e) {
    const id = e?.currentTarget?.dataset?.id;
    const name = e?.currentTarget?.dataset?.name ?? "";
    if (!id) return;
    const url = `/pages/list/list?categoryId=${encodeURIComponent(
      id
    )}&categoryName=${encodeURIComponent(String(name))}`;
    this._navTo(url);
  },

  goSearch() {
    this._navTo("/pages/search/search");
  },

  goAdmin() {
    if (!this.data.isAdmin) return;
    this._navTo("/pages/admin/index/index");
  },

  goCategoryAdmin() {
    if (!this.data.isAdmin) return;
    this._navTo("/pages/admin/category/category");
  }
});

