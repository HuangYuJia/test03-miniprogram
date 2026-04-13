const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 小程序端 getTempFileURL 在云存储为「仅创建者可读」等规则下会报 STORAGE_EXCEED_AUTHORITY。
 * 云函数内换链具备管理员权限，供前端批量拉取 https 展示图。
 */
exports.main = async (event) => {
  const raw = event?.fileList;
  const fileList = Array.isArray(raw)
    ? raw
        .map((x) => String(x || "").trim())
        .filter((x) => x.startsWith("cloud://"))
        .slice(0, 50)
    : [];
  if (!fileList.length) return { fileList: [] };

  const r = await cloud.getTempFileURL({ fileList });
  return { fileList: r.fileList || [] };
};
