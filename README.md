# 抖音续火花

通过 Chrome 自动打开抖音，向配置的联系人发送一次“续火花”。脚本使用独立浏览器登录态，不读取或导出 Cookie，发送失败时不会自动重试。

## 环境要求

- macOS
- Google Chrome
- Node.js 20 或更高版本

## 安装

```bash
npm install
```

## 配置联系人

修改 `config.cjs` 中的 `recipient`：

```js
module.exports = {
  recipient: "联系人名称",
};
```

## 使用

```bash
# 初始化登录态并确认联系人，不发送
./run.sh --setup

# 校验联系人和“续火花”表情，不发送
./run.sh --dry-run

# 发送一次；同一联系人当天已成功发送则跳过
./run.sh --send

# 忽略当天发送记录，强制再发送一次
./run.sh --force-send
```

首次运行或登录失效时，脚本会保持浏览器打开并提示登录；登录完成后自动继续。后续运行会复用登录态。

登录 Profile 和发送状态保存在：

```text
~/Library/Application Support/DouyinRenewFlame/
```

发送成功需同时满足：发送接口返回 HTTP 200，并且聊天区出现新的“续火花”图片。
