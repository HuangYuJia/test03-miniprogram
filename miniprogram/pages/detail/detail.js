import { centsToYuanText } from "../../utils/money";
import { createNavigateOnce } from "../../utils/navGuard";
import {
  allImageFileIdsForProduct,
  getTempUrls,
  invalidateTempUrlCache
} from "../../utils/fileUrl";

const db = wx.cloud.database();

/** 详情页「联系商家」拨号号码 */
const SERVICE_PHONE = "13430020810";
/** 详情页展示的微信号（底部备注区） */
const SERVICE_WECHAT_ID = "yjy88888812";

Page({
  data: {
    id: "",
    loading: true,
    item: null,
    images: [],
    servicePhoneDisplay: SERVICE_PHONE,
    serviceWechatId: SERVICE_WECHAT_ID
  },

  onLoad(options) {
    this._navTo = createNavigateOnce(500);
    const id = options.id || "";
    this.setData({ id });
    this.load();
  },

  goHome() {
    this._navTo("/pages/home/home");
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await db.collection("products").doc(this.data.id).get();
      const p = res.data;

      if (!p || p.enabled !== true) {
        this.setData({ item: null, images: [] });
        return;
      }

      const fileIds = allImageFileIdsForProduct(p);
      const item = {
        ...p,
        priceText: centsToYuanText(p.price),
        yearText: (() => {
          const y = String(p?.year || "").trim();
          if (/^\d{4}$/.test(y)) return y;
          const ym = String(p?.yearMonth || "").trim();
          const m = ym.match(/^(\d{4})-(\d{2})$/);
          return m ? m[1] : "";
        })(),
        imageFileIds: fileIds
      };

      // 仅使用换链后的 https；勿把 cloud:// 塞进 image src（会被当成相对路径）
      let imgs = [];
      if (fileIds.length) {
        const map = await getTempUrls(fileIds);
        imgs = fileIds.map((id) => map.get(id)).filter(Boolean);
      }
      const httpsCover =
        imgs.find((x) => String(x).startsWith("https://")) || "";
      item.coverUrl = httpsCover || "";

      this.setData({ item, images: imgs });
    } catch (e) {
      wx.showToast({ title: "读取详情失败", icon: "none" });
      this.setData({ item: null, images: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onImageError() {
    const p = this.data.item;
    if (!p) return;
    const fileIds = allImageFileIdsForProduct(p);
    fileIds.forEach((id) => invalidateTempUrlCache(id));
    try {
      let imgs = [];
      if (fileIds.length) {
        const map = await getTempUrls(fileIds);
        imgs = fileIds.map((id) => map.get(id)).filter(Boolean);
      }
      const httpsCover =
        imgs.find((x) => String(x).startsWith("https://")) || "";
      const patch = { images: imgs };
      if (httpsCover) patch["item.coverUrl"] = httpsCover;
      this.setData(patch);
    } catch (err) {
      // ignore
    }
  },

  preview(e) {
    const idx = Number(e?.currentTarget?.dataset?.idx || 0);
    const urls = (this.data.images || []).filter(Boolean);
    if (!urls.length) return;
    const current = urls[Math.max(0, Math.min(idx, urls.length - 1))];
    wx.previewImage({
      current,
      urls
    });
  },

  callPhone() {
    wx.makePhoneCall({
      phoneNumber: SERVICE_PHONE,
      fail() {
        wx.showToast({ title: "无法拨号", icon: "none" });
      }
    });
  },

  onShareAppMessage() {
    const item = this.data.item;
    if (!item) return {};
    const stroke = item.unit ? ` 行程${item.unit}` : "";
    const title = `${item.name} ¥${item.priceText}${stroke}`;
    return {
      title,
      path: `/pages/detail/detail?id=${this.data.id}`,
      imageUrl:
        item.coverUrl ||
        this.data.images.find((x) => String(x).startsWith("https://")) ||
        this.data.images[0] ||
        ""
    };
  }
});

