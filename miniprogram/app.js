App({
  onLaunch() {
    if (!wx.cloud) {
      console.error("当前基础库不支持云开发。请升级微信版本/基础库。");
      return;
    }

    wx.cloud.init({
      env: "cloud1-6g3tn8iu5d63300f",
      traceUser: true
    });
  }
});

