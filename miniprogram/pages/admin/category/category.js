import { isAdmin } from "../../../utils/admin";

const db = wx.cloud.database();

function updateItem(items, id, patch) {
  return items.map((it) => (it._id === id ? { ...it, ...patch } : it));
}

Page({
  data: {
    isAdmin: false,
    loading: true,
    newName: "",
    items: [],
    countText: "",
    dirtyCount: 0
  },

  // 记录哪些分类被修改但未保存
  dirtyIds: new Set(),

  async onLoad() {
    const ok = await isAdmin();
    this.setData({ isAdmin: ok });
    if (!ok) {
      wx.showToast({ title: "无权限", icon: "none" });
      return;
    }
    await this.load();
  },

  onNewName(e) {
    this.setData({ newName: e.detail.value });
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await db
        .collection("categories")
        .orderBy("sort", "asc")
        .orderBy("createdAt", "desc")
        .get();
      const items = res.data || [];
      this.setData({
        items,
        countText: items.length ? `共 ${items.length} 个` : "暂无"
      });
      // 刷新列表时重置脏标记
      this.dirtyIds = new Set();
      this.setData({ dirtyCount: 0 });
    } catch (e) {
      wx.showToast({ title: "读取分类失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onNameChange(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.detail.value;
    this.dirtyIds.add(id);
    this.setData({
      items: updateItem(this.data.items, id, { name }),
      dirtyCount: this.dirtyIds.size
    });
  },

  onEnabledChange(e) {
    const id = e.currentTarget.dataset.id;
    const enabled = Boolean(e.detail.value);
    this.dirtyIds.add(id);
    this.setData({
      items: updateItem(this.data.items, id, { enabled }),
      dirtyCount: this.dirtyIds.size
    });
  },

  onSortChange(e) {
    const id = e.currentTarget.dataset.id;
    const sort = Number(e.detail.value || 0);
    this.dirtyIds.add(id);
    this.setData({
      items: updateItem(this.data.items, id, { sort }),
      dirtyCount: this.dirtyIds.size
    });
  },

  async add() {
    const name = (this.data.newName || "").trim();
    if (!name) {
      wx.showToast({ title: "请输入分类名称", icon: "none" });
      return;
    }
    let loadingOn = false;
    try {
      wx.showToast({ title: "已触发添加", icon: "none", duration: 800 });
      wx.showLoading({ title: "添加中" });
      loadingOn = true;
      await wx.cloud.callFunction({
        name: "categorySave",
        data: { doc: { name, enabled: true, sort: 0 } }
      });
      this.setData({ newName: "" });
      await this.load();
    } catch (e) {
      if (loadingOn) {
        wx.hideLoading();
        loadingOn = false;
      }
      const detail = e?.errMsg || e?.message || String(e);
      wx.showToast({ title: "添加失败", icon: "none" });
      console.error("category add error:", detail, e);
      wx.showModal({
        title: "添加分类失败",
        content: detail.length > 200 ? detail.slice(0, 200) + "…" : detail,
        showCancel: false
      });
    } finally {
      if (loadingOn) wx.hideLoading();
    }
  },

  async saveOne(e) {
    const id = e.currentTarget.dataset.id;
    const doc = this.data.items.find((x) => x._id === id);
    if (!doc) return;
    const name = (doc.name || "").trim();
    if (!name) {
      wx.showToast({ title: "分类名不能为空", icon: "none" });
      return;
    }
    let loadingOn = false;
    try {
      wx.showLoading({ title: "保存中" });
      loadingOn = true;
      await wx.cloud.callFunction({
        name: "categorySave",
        data: {
          id,
          doc: {
            name,
            enabled: Boolean(doc.enabled),
            sort: Number(doc.sort || 0)
          }
        }
      });
      wx.showToast({ title: "已保存", icon: "success" });
      // 不刷新整页，避免覆盖其他未保存的编辑
      this.dirtyIds.delete(id);
      this.setData({ dirtyCount: this.dirtyIds.size });
    } catch (e2) {
      if (loadingOn) {
        wx.hideLoading();
        loadingOn = false;
      }
      const detail = e2?.errMsg || e2?.message || String(e2);
      wx.showToast({ title: "保存失败", icon: "none" });
      console.error("category save error:", detail, e2);
      wx.showModal({
        title: "保存分类失败",
        content: detail.length > 200 ? detail.slice(0, 200) + "…" : detail,
        showCancel: false
      });
    } finally {
      if (loadingOn) wx.hideLoading();
    }
  }

  ,
  async saveAll() {
    const ids = Array.from(this.dirtyIds);
    if (!ids.length) {
      wx.showToast({ title: "没有未保存的修改", icon: "none" });
      return;
    }

    // 校验
    for (const id of ids) {
      const doc = this.data.items.find((x) => x._id === id);
      const name = (doc?.name || "").trim();
      if (!name) {
        wx.showToast({ title: "存在空分类名，先补全", icon: "none" });
        return;
      }
    }

    let loadingOn = false;
    try {
      wx.showLoading({ title: `保存中(${ids.length})` });
      loadingOn = true;
      for (const id of ids) {
        const doc = this.data.items.find((x) => x._id === id);
        await wx.cloud.callFunction({
          name: "categorySave",
          data: {
            id,
            doc: {
              name: String(doc.name || "").trim(),
              enabled: Boolean(doc.enabled),
              sort: Number(doc.sort || 0)
            }
          }
        });
        this.dirtyIds.delete(id);
        this.setData({ dirtyCount: this.dirtyIds.size });
      }
      wx.showToast({ title: "全部已保存", icon: "success" });
    } catch (e) {
      if (loadingOn) {
        wx.hideLoading();
        loadingOn = false;
      }
      const detail = e?.errMsg || e?.message || String(e);
      wx.showToast({ title: "保存失败（看控制台）", icon: "none" });
      console.error("category saveAll error:", detail, e);
    } finally {
      if (loadingOn) wx.hideLoading();
    }
  }
});

