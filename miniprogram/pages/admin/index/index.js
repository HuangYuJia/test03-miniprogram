import { isAdmin } from "../../../utils/admin";
import { createNavigateOnce } from "../../../utils/navGuard";
import {
  getTempUrls,
  hydrateCoverUrls,
  invalidateTempUrlCache,
  resolveCoverFileId
} from "../../../utils/fileUrl";

const db = wx.cloud.database();

Page({
  /** 完整列表（筛选在内存中进行） */
  allProducts: [],

  data: {
    isAdmin: false,
    authLoading: true,
    loading: true,
    /** 列表筛选：all | on(仅上架) | off(仅下架) */
    listFilter: "all",
    items: [],
    /** 云库中商品总数，用于区分「真无数据」与「筛选为空」 */
    productTotalCount: 0,
    countText: ""
  },

  async onLoad() {
    this._navTo = createNavigateOnce(500);
    await this.refreshAdmin();
    if (this.data.isAdmin) await this.loadProducts();
  },

  async onShow() {
    await this.refreshAdmin();
    if (this.data.isAdmin) await this.loadProducts();
  },

  async refreshAdmin() {
    this.setData({ authLoading: true });
    try {
      const ok = await isAdmin();
      this.setData({ isAdmin: ok });
    } finally {
      this.setData({ authLoading: false });
    }
  },

  async loadProducts() {
    this.setData({ loading: true });
    try {
      let res;
      try {
        res = await db
          .collection("products")
          .orderBy("sort", "asc")
          .orderBy("updatedAt", "desc")
          .limit(50)
          .get();
      } catch (e1) {
        res = await db.collection("products").orderBy("sort", "asc").limit(50).get();
      }

      let catList = [];
      try {
        const catRes = await db
          .collection("categories")
          .orderBy("sort", "asc")
          .orderBy("createdAt", "desc")
          .limit(200)
          .get();
        catList = catRes.data || [];
      } catch (e2) {
        catList = [];
      }

      const catMap = new Map(
        catList.map((c) => [c._id, String(c.name || "").trim() || "未命名分类"])
      );

      const items = (res.data || []).map((p) => ({
        ...p,
        coverUrl: p.coverUrl || "",
        coverFileId: resolveCoverFileId(p),
        categoryName: catMap.get(p.categoryId) || "未分类"
      }));

      await hydrateCoverUrls(items);

      this.allProducts = items;
      this.setData({ productTotalCount: items.length });
      this.applyListFilter();
    } catch (e) {
      this.allProducts = [];
      this.setData({ productTotalCount: 0, items: [], countText: "暂无商品" });
      const detail = e?.errMsg || e?.message || String(e);
      wx.showToast({ title: "读取商品失败", icon: "none" });
      console.error("loadProducts error:", detail, e);
      wx.showModal({
        title: "读取商品失败",
        content: detail.length > 200 ? detail.slice(0, 200) + "…" : detail,
        showCancel: false
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  applyListFilter() {
    const f = this.data.listFilter;
    const all = this.allProducts || [];
    let rows;
    if (f === "on") rows = all.filter((p) => p.enabled === true);
    else if (f === "off") rows = all.filter((p) => p.enabled !== true);
    else {
      // 全部：已上架在前，已下架在后（同状态内保持云端返回的 sort / 时间顺序）
      rows = [...all].sort((a, b) => {
        const ra = a.enabled === true ? 0 : 1;
        const rb = b.enabled === true ? 0 : 1;
        return ra - rb;
      });
    }

    const total = all.length;
    const onCount = all.filter((p) => p.enabled === true).length;
    const offCount = total - onCount;

    let countText = "";
    if (!total) countText = "暂无商品";
    else if (f === "all") {
      countText = `共 ${total} 个（上架 ${onCount} · 下架 ${offCount}）`;
    } else if (f === "on") {
      countText = rows.length ? `已上架 ${rows.length} 个` : "当前无已上架商品";
    } else {
      countText = rows.length ? `已下架 ${rows.length} 个` : "当前无已下架商品";
    }

    this.setData({ items: rows, countText });
  },

  onListFilter(e) {
    const f = e?.currentTarget?.dataset?.filter || "all";
    if (f === this.data.listFilter) return;
    this.setData({ listFilter: f });
    this.applyListFilter();
  },

  async onThumbError(e) {
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
  },

  async toggle(e) {
    const id = e.currentTarget.dataset.id;
    const enabled = Boolean(e.currentTarget.dataset.enabled);
    try {
      wx.showLoading({ title: enabled ? "下架中" : "上架中" });
      await wx.cloud.callFunction({
        name: "productToggle",
        data: { id, enabled: !enabled }
      });
      await this.loadProducts();
    } catch (err) {
      wx.showToast({ title: "操作失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  goHome() {
    this._navTo("/pages/home/home");
  },

  goProductNew() {
    this._navTo("/pages/admin/product-edit/product-edit");
  },

  goCategoryManage() {
    this._navTo("/pages/admin/category/category");
  },

  goEditProduct(e) {
    const id = e?.currentTarget?.dataset?.id;
    if (!id) return;
    this._navTo(
      `/pages/admin/product-edit/product-edit?id=${encodeURIComponent(id)}`
    );
  },

  async copyOpenId() {
    try {
      // 先尝试在客户端直接取 WXContext（用于判断 traceUser/身份识别是否生效）
      let localCtx = null;
      try {
        if (wx.cloud.getWXContext) localCtx = wx.cloud.getWXContext();
      } catch (err) {
        // ignore
      }
      if (localCtx) {
        const lo = localCtx.OPENID || localCtx.openid || "";
        const la = localCtx.APPID || localCtx.appid || "";
        // 若客户端都拿不到 openid，也更容易定位到云环境身份识别未开启
        if (!lo) {
          wx.showToast({
            title: `客户端WXContext拿不到OPENID（APPID=${la || ""}）`,
            icon: "none",
            duration: 4000
          });
        }
      }

      const res = await wx.cloud.callFunction({ name: "login", data: {} });
      // 兼容不同 login 云函数返回结构
      const openid =
        res?.result?.openid ||
        res?.result?.openId ||
        res?.result?.userInfo?.openId ||
        res?.result?.userInfo?.openid ||
        "";
      if (!openid) {
        const debug = res?.result?.debug || {};
        throw new Error(
          `no openid (OPENID=${debug.OPENID || ""}, openid=${debug.openid || ""}, APPID=${debug.APPID || ""})`
        );
      }
      wx.setClipboardData({
        data: openid,
        success() {
          wx.showToast({ title: "已复制 openid", icon: "success" });
        }
      });
    } catch (e) {
      const detail = e?.errMsg || e?.message || String(e);
      // 显示更具体的错误，方便判断是“函数未部署/环境不匹配/权限”等问题
      const short = detail.length > 28 ? detail.slice(0, 28) + "..." : detail;
      wx.showToast({ title: short, icon: "none", duration: 3500 });
      console.error("copyOpenId error:", detail);
    }
  }
});

