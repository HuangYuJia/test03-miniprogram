import { centsToYuanText } from "../../utils/money";
import { createNavigateOnce } from "../../utils/navGuard";
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

async function fetchAll(query, { pageSize = 20, max = 1000 } = {}) {
  const all = [];
  let skip = 0;
  while (true) {
    const res = await query.skip(skip).limit(pageSize).get();
    const rows = res.data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    skip += pageSize;
    if (skip >= max) break;
  }
  return all;
}

Page({
  data: {
    q: "",
    loading: false,
    searched: false,
    items: [],
    countText: ""
  },

  onLoad() {
    this._navTo = createNavigateOnce(500);
  },

  onInput(e) {
    this.setData({ q: e.detail.value });
  },

  async onSearch() {
    if (this._searchBusy) return;
    this._searchBusy = true;
    const q = (this.data.q || "").trim();
    this.setData({ loading: true, searched: true, countText: "" });
    try {
      let query = db.collection("products").where({ enabled: true });
      if (q) {
        const regex = db.RegExp({
          regexp: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          options: "i"
        });
        query = query.where({ name: regex });
      }

      query = query.orderBy("sort", "asc").orderBy("updatedAt", "desc");
      const data = await fetchAll(query, { pageSize: 20, max: 1000 });

      const items = (data || []).map((p) => ({
        ...p,
        coverUrl: p.coverUrl || "",
        coverFileId: resolveCoverFileId(p),
        priceText: centsToYuanText(p.price),
        yearText: yearTextFromProduct(p)
      }));

      await hydrateCoverUrls(items);

      this.setData({
        items,
        countText: items.length ? `共 ${items.length} 个` : "暂无结果"
      });
    } catch (e) {
      wx.showToast({ title: "搜索失败", icon: "none" });
      this.setData({ items: [], countText: "" });
    } finally {
      this.setData({ loading: false });
      this._searchBusy = false;
    }
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

