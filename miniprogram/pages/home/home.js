import { isAdmin, ensureCollectionsExistHint } from "../../utils/admin";
import { createNavigateOnce } from "../../utils/navGuard";

const db = wx.cloud.database();

function numberFromName(name) {
  const s = String(name || "");
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return Number.POSITIVE_INFINITY;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

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

      const categories = (res.data || []).slice().sort((a, b) => {
        const na = numberFromName(a?.name);
        const nb = numberFromName(b?.name);
        if (na !== nb) return na - nb;
        const sa = Number(a?.sort ?? 0);
        const sb = Number(b?.sort ?? 0);
        if (sa !== sb) return sa - sb;
        return String(a?.name || "").localeCompare(String(b?.name || ""), "zh-Hans-CN");
      });
      this.setData({ categories });
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
  },

  /** 右上角「转发给朋友」依赖此回调，否则菜单常为灰 */
  onShareAppMessage() {
    return {
      title: "产品相册报价 · 看图看价",
      path: "/pages/home/home"
    };
  },

  /** 分享到朋友圈（需 home.json 开启 enableShareTimeline；个人主体可能仍受限） */
  onShareTimeline() {
    return {
      title: "产品相册报价 · 看图看价",
      query: ""
    };
  }
});

