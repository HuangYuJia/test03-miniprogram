import { isAdmin } from "../../../utils/admin";
import {
  allImageFileIdsForProduct,
  getTempUrls,
  invalidateTempUrlCache
} from "../../../utils/fileUrl";

const db = wx.cloud.database();

function splitTags(text) {
  return (text || "")
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

Page({
  data: {
    isAdmin: false,
    id: "",
    categories: [],
    categoryIndex: 0,

    name: "",
    price: "",
    unit: "",
    /** 必填：年份（YYYY） */
    year: "",
    /** 选填：月份（01-12） */
    month: "",
    monthOptions: ["（不填）", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"],
    monthIndex: 0,
    /** picker 默认值：当前年份（YYYY） */
    defaultYear: "",
    tagsText: "",
    desc: "",
    enabled: true,
    sort: "0",

    // 图片
    fileIds: [],
    previews: []
  },

  async onLoad(options) {
    // 年份 picker fields="year" 需要 YYYY
    const now = new Date();
    const defaultYear = `${now.getFullYear()}`;
    this.setData({ defaultYear });

    const ok = await isAdmin();
    this.setData({ isAdmin: ok });
    if (!ok) {
      wx.showToast({ title: "无权限", icon: "none" });
      wx.navigateBack();
      return;
    }

    await this.loadCategories();

    const id = options.id || "";
    if (id) {
      this.setData({ id });
      await this.loadProduct();
    }
  },

  async loadCategories() {
    const res = await db
      .collection("categories")
      .where({ enabled: true })
      .orderBy("sort", "asc")
      .orderBy("createdAt", "desc")
      .get();
    const categories = res.data || [];
    this.setData({ categories, categoryIndex: 0 });
  },

  async loadProduct() {
    try {
      const res = await db.collection("products").doc(this.data.id).get();
      const p = res.data;
      const hasYear = Object.prototype.hasOwnProperty.call(p || {}, "year");
      const hasMonth = Object.prototype.hasOwnProperty.call(p || {}, "month");
      const categories = this.data.categories || [];
      const idx = Math.max(
        0,
        categories.findIndex((c) => c._id === p.categoryId)
      );
      const fileIds = allImageFileIdsForProduct(p);
      // 与 fileIds 逐项对齐，避免 filter 导致 previews 与 fileIds 长度不一致、删图错位
      let previews = [];
      if (fileIds.length) {
        const map = await getTempUrls(fileIds);
        previews = fileIds.map((id) => {
          const fid = String(id || "").trim();
          if (!fid) return "";
          const u = map.get(fid);
          return u && String(u).startsWith("https://") ? u : "";
        });
      } else if (Array.isArray(p.imageUrls) && p.imageUrls.length) {
        previews = p.imageUrls
          .map((x) => String(x || "").trim())
          .filter((x) => x.startsWith("https://"));
      }

      this.setData({
        name: p.name || "",
        price: String(p.price ?? ""),
        unit: p.unit || "",
        year: (() => {
          // 如果 year 字段存在（哪怕为空），就以它为准；否则才从旧的 yearMonth 兜底
          const y = String(p.year || "").trim();
          if (hasYear) return y;
          if (y) return y;
          const ym = String(p.yearMonth || "").trim();
          const m = ym.match(/^(\d{4})-(\d{2})$/);
          return m ? m[1] : "";
        })(),
        month: (() => {
          // 如果 month 字段存在（哪怕为空），就以它为准；否则才从旧的 yearMonth 兜底
          const mo = String(p.month || "").trim();
          if (hasMonth) return mo ? mo.padStart(2, "0") : "";
          if (mo) return mo.padStart(2, "0");
          const ym = String(p.yearMonth || "").trim();
          const m = ym.match(/^(\d{4})-(\d{2})$/);
          return m ? m[2] : "";
        })(),
        tagsText: Array.isArray(p.tags) ? p.tags.join(",") : "",
        desc: p.desc || "",
        enabled: Boolean(p.enabled),
        sort: String(p.sort ?? 0),
        fileIds,
        previews,
        categoryIndex: idx === -1 ? 0 : idx
      });
      // 回显月份 picker 索引
      const mo = String(this.data.month || "").trim();
      const monthIndex = mo ? Math.max(1, this.data.monthOptions.indexOf(mo)) : 0;
      this.setData({ monthIndex: monthIndex === -1 ? 0 : monthIndex });
    } catch (e) {
      wx.showToast({ title: "读取商品失败", icon: "none" });
    }
  },

  async onPreviewImageError(e) {
    const idx = Number(e?.currentTarget?.dataset?.idx);
    const fileIds = this.data.fileIds || [];
    if (!Number.isFinite(idx) || idx < 0 || idx >= fileIds.length) return;
    const fid = String(fileIds[idx] || "").trim();
    if (!fid) return;
    try {
      invalidateTempUrlCache(fid);
      const map = await getTempUrls([fid]);
      const url = map.get(fid) || "";
      if (url && String(url).startsWith("https://")) {
        this.setData({ [`previews[${idx}]`]: url });
      }
    } catch (err) {
      /* ignore */
    }
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },
  onPrice(e) {
    this.setData({ price: e.detail.value });
  },
  onUnit(e) {
    this.setData({ unit: e.detail.value });
  },
  onYearPick(e) {
    const v = String(e?.detail?.value || "").trim();
    // fields="year" 返回形如 "2026"
    const year = v ? v.slice(0, 4) : "";
    this.setData({ year });
  },
  onMonthPick(e) {
    const idx = Number(e?.detail?.value || 0);
    const opt = this.data.monthOptions[idx] || "";
    const month = opt === "（不填）" ? "" : opt;
    this.setData({ monthIndex: idx, month });
  },
  onTags(e) {
    this.setData({ tagsText: e.detail.value });
  },
  onDesc(e) {
    this.setData({ desc: e.detail.value });
  },
  onEnabled(e) {
    this.setData({ enabled: Boolean(e.detail.value) });
  },
  onSort(e) {
    this.setData({ sort: e.detail.value });
  },
  onCategoryPick(e) {
    this.setData({ categoryIndex: Number(e.detail.value || 0) });
  },

  async chooseImages() {
    const res = await wx.chooseMedia({
      count: 9,
      mediaType: ["image"],
      sizeType: ["compressed", "original"],
      sourceType: ["album", "camera"]
    });
    const files = (res.tempFiles || []).map((f) => f.tempFilePath);
    if (!files.length) return;

    wx.showLoading({ title: "上传中" });
    try {
      const uploaded = [];
      const previews = [];
      for (const path of files) {
        const cloudPath = `products/${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}.jpg`;
        const up = await wx.cloud.uploadFile({
          cloudPath,
          filePath: path
        });
        uploaded.push(up.fileID);
        previews.push(path);
      }
      // 追加到原有
      this.setData({
        fileIds: [...this.data.fileIds, ...uploaded],
        previews: [...this.data.previews, ...previews]
      });
      wx.showToast({ title: "已上传", icon: "success" });
    } catch (e) {
      wx.showToast({ title: "上传失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  async removeImage(e) {
    const idx = Number(e?.currentTarget?.dataset?.idx);
    if (!Number.isFinite(idx) || idx < 0) return;

    const fileIds = this.data.fileIds || [];
    const previews = this.data.previews || [];
    if (idx >= fileIds.length && idx >= previews.length) return;

    const res = await new Promise((resolve) => {
      wx.showModal({
        title: "移除图片",
        content: "确定从该商品中移除这张图片吗？（不会删除云存储原图）",
        confirmText: "移除",
        cancelText: "取消",
        success(r) {
          resolve(r);
        }
      });
    });
    if (!res?.confirm) return;

    const nextFileIds = fileIds.slice();
    const nextPreviews = previews.slice();
    if (idx < nextFileIds.length) nextFileIds.splice(idx, 1);
    if (idx < nextPreviews.length) nextPreviews.splice(idx, 1);

    this.setData({
      fileIds: nextFileIds,
      previews: nextPreviews
    });
  },

  async save() {
    const name = (this.data.name || "").trim();
    if (!name) {
      wx.showToast({ title: "请填写名称", icon: "none" });
      return;
    }

    const categories = this.data.categories || [];
    const category = categories[this.data.categoryIndex];
    if (!category) {
      wx.showToast({ title: "请选择分类", icon: "none" });
      return;
    }

    const year = String(this.data.year || "").trim();
    if (!/^\d{4}$/.test(year)) {
      wx.showToast({ title: "年份必填（如 2026）", icon: "none" });
      return;
    }
    const month = String(this.data.month || "").trim();
    if (month && !/^(0[1-9]|1[0-2])$/.test(month)) {
      wx.showToast({ title: "月份格式不正确（01-12）", icon: "none" });
      return;
    }

    const price = Number(this.data.price);
    if (!Number.isFinite(price) || price < 0) {
      wx.showToast({ title: "价格请输入数字（分）", icon: "none" });
      return;
    }

    if (!this.data.fileIds.length) {
      wx.showToast({ title: "请至少上传1张图片", icon: "none" });
      return;
    }

    const doc = {
      name,
      categoryId: category._id,
      price: Math.round(price),
      unit: (this.data.unit || "").trim(),
      year,
      month,
      tags: splitTags(this.data.tagsText),
      desc: (this.data.desc || "").trim(),
      enabled: Boolean(this.data.enabled),
      sort: Number(this.data.sort || 0),
      imageFileIds: this.data.fileIds
    };

    try {
      wx.showLoading({ title: "保存中" });
      const res = await wx.cloud.callFunction({
        name: "productSave",
        data: {
          id: this.data.id || undefined,
          doc
        }
      });
      const id = res?.result?.id || this.data.id;
      wx.showToast({ title: "已保存", icon: "success" });
      // 保存后返回管理列表
      wx.navigateBack();
      this.setData({ id });
    } catch (e) {
      wx.showToast({ title: "保存失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  }
});

