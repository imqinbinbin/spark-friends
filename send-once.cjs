#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright-core");
const { recipient: RECIPIENT } = require("./config.cjs");

if (typeof RECIPIENT !== "string" || !RECIPIENT.trim()) {
  console.error("请在 config.cjs 中配置非空的 recipient");
  process.exit(2);
}

const STICKER = "续火花";
const STICKER_OBJECT_ID = "1687263281313-ts-e7bbade781abe88ab12e706e67";
const HOME_URL = "https://www.douyin.com/?recommend=1";
const DATA_DIR = path.join(os.homedir(), "Library", "Application Support", "DouyinRenewFlame");
const PROFILE_DIR = path.join(DATA_DIR, "ChromeProfile");
const STATE_PATH = path.join(DATA_DIR, "state.json");
const mode = process.argv[2];

if (!["--setup", "--dry-run", "--send", "--force-send"].includes(mode)) {
  console.error("用法: ./run.sh --setup | --dry-run | --send | --force-send");
  process.exit(2);
}

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeSuccess() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    STATE_PATH,
    `${JSON.stringify({ recipient: RECIPIENT, date: today(), status: "success", at: new Date().toISOString() })}\n`,
    { mode: 0o600 },
  );
}

async function firstVisible(locator) {
  for (const item of await locator.all()) {
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function waitForLogin(page) {
  const entry = page.locator('[data-e2e="im-entry"]');
  const dialog = page.locator('[data-e2e="im-dialog"]');
  await entry.waitFor({ state: "visible", timeout: 45_000 });
  await entry.click({ timeout: 10_000 });
  if (await dialog.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) return;

  console.log("尚未登录抖音，请在浏览器中完成登录；脚本会一直等待并在登录后自动继续。");
  await page.evaluate(() => {
    const notice = document.createElement("div");
    notice.id = "renew-flame-login-notice";
    notice.textContent = "请先登录抖音，登录完成后脚本会自动继续";
    notice.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:14px 22px;border-radius:8px;background:#ff2c55;color:white;font:16px sans-serif;box-shadow:0 4px 16px #0005";
    document.body.appendChild(notice);
  });

  while (!(await dialog.isVisible().catch(() => false))) {
    if (!(await firstVisible(page.getByText("登录", { exact: true })))) {
      await entry.click({ timeout: 10_000 }).catch(() => {});
      await dialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    }
    await page.waitForTimeout(1_000);
  }

  await page.locator("#renew-flame-login-notice").evaluate((notice) => notice.remove()).catch(() => {});
  console.log("登录成功，继续执行。");
}

async function openTargetChat(page) {
  const entry = page.locator('[data-e2e="im-entry"]');
  const dialog = page.locator('[data-e2e="im-dialog"]');
  if (!(await dialog.isVisible().catch(() => false))) {
    await entry.click({ timeout: 10_000 });
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
  }

  const matches = [];
  const target = page.getByText(RECIPIENT, { exact: true });
  await target.first().waitFor({ state: "visible", timeout: 20_000 });
  for (const item of await target.all()) {
    if (!(await item.isVisible().catch(() => false))) continue;
    const box = await item.boundingBox();
    if (box) matches.push({ item, box });
  }
  if (!matches.length) throw new Error(`找不到会话“${RECIPIENT}”`);

  matches.sort((a, b) => a.box.x - b.box.x);
  await matches[0].item.click({ timeout: 10_000 });
  await page.waitForTimeout(800);

  const headerOk = await page.evaluate((recipient) =>
    Array.from(document.querySelectorAll("body *")).some((el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (el.textContent || "").trim() === recipient &&
        style.display !== "none" && style.visibility !== "hidden" &&
        box.width > 0 && box.height > 0 && box.y < 280 && box.x > innerWidth * 0.25;
    }), RECIPIENT);
  if (!headerOk) throw new Error(`聊天标题没有精确匹配“${RECIPIENT}”`);
}

async function run() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  });
  const page = context.pages()[0] || (await context.newPage());

  try {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForLogin(page);

    if (mode === "--setup") {
      await page.getByText(RECIPIENT, { exact: true }).first().waitFor({ state: "visible", timeout: 600_000 });
      console.log("登录态已保存。");
      return;
    }

    const state = readState();
    if (mode === "--send" && (!state.recipient || state.recipient === RECIPIENT) && state.date === today() && state.status === "success") {
      console.log("今天已经发送成功，跳过。");
      return;
    }

    await openTargetChat(page);
    const emoji = await firstVisible(page.locator("svg.messageMsgInputiconAction"));
    if (!emoji) throw new Error("找不到圆脸表情按钮");
    await emoji.click({ timeout: 10_000 });

    const sticker = await firstVisible(
      page.locator("div.emojiEmojiItememojiItem").filter({ hasText: STICKER }),
    );
    if (!sticker || !(await sticker.getByText(STICKER, { exact: true }).count())) {
      throw new Error(`找不到精确表情“${STICKER}”`);
    }
    if (mode === "--dry-run") {
      console.log(`校验成功：会话=${RECIPIENT}，表情=${STICKER}；没有发送。`);
      return;
    }

    await page.evaluate((objectId) => {
      window.__renewFlameObserved = false;
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            const images = node.matches("img") ? [node] : Array.from(node.querySelectorAll("img"));
            if (images.some((img) =>
              (img.currentSrc || img.src).includes(objectId) && !img.closest(".componentsemojiemojiPanel"))) {
              window.__renewFlameObserved = true;
              observer.disconnect();
              return;
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }, STICKER_OBJECT_ID);

    const responsePromise = page.waitForResponse(
      (response) => response.url().includes("/v1/message/send") && response.request().method() === "POST",
      { timeout: 15_000 },
    );
    await sticker.click({ timeout: 10_000 });
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error(`发送接口返回 HTTP ${response.status()}`);
    await page.waitForFunction(() => window.__renewFlameObserved === true, undefined, { timeout: 15_000 });

    writeSuccess();
    console.log(`发送成功：${RECIPIENT} <- ${STICKER}`);
  } finally {
    await context.close();
  }
}

run().catch((error) => {
  console.error(`失败（没有自动重试）：${error.message}`);
  process.exitCode = 1;
});
