const axios = require("axios");
const fs = require("fs");
const chalk = require("chalk").default;
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const banner = require('./config/banner');
dayjs.extend(utc);
dayjs.extend(timezone);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cookies = fs.readFileSync("data.txt", "utf-8")
  .split("\n")
  .map(line => line.trim())
  .filter(line => line.length > 0);


async function getLastClaim(headers) {
  try {
    const res = await axios.get("https://dashboard.synthelix.io/api/get/lastclaim", { headers });
    return res.data.lastDailyClaim;
  } catch (err) {
    console.log(chalk.red("❌ Gagal ambil lastDailyClaim:"), err.message);
    return null;
  }
}

async function getPoints(headers) {
  try {
    const res = await axios.get("https://dashboard.synthelix.io/api/get/points", { headers });
    return res.data?.points ?? 0;
  } catch (err) {
    console.log(chalk.red("❌ Failed to get points:"), err.message);
    return 0;
  }
}

async function startNode(headers) {
  try {
    const res = await axios.post("https://dashboard.synthelix.io/api/node/start", null, { headers });
    const formattedTime = dayjs.utc(res.data.startTime).tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");
    console.log(chalk.blue(`[INFO] Node started succesfully at: ${formattedTime} WIB`));
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    if (msg === "Node is already running") {
      console.log(chalk.yellow("[INFO] Node is already running."));
    } else {
      console.log(chalk.red("❌ Failed to start node:"), msg);
    }
  }
}

async function claimDaily(headers) {
  const before = await getPoints(headers);
  console.log(chalk.cyan(`[INFO] Points before claim: ${before}`));

  const amount = before > 0 ? before : 1;

  try {
    const res = await axios.post("https://dashboard.synthelix.io/api/rew/dailypoints", { points: amount }, { headers });
    const { points, lastDailyClaim } = res.data;
    const formattedTime = dayjs.utc(lastDailyClaim).tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");
    console.log(chalk.green(`[INFO] Claimed daily: succesfully at ${formattedTime} WIB`));
    console.log(chalk.green(`[INFO] Points claimed : ${points}`));
    const after = await getPoints(headers);
    console.log(chalk.cyan(`[INFO] Points after claim: ${after}`));
  } catch (err) {
    const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message;
    console.log(chalk.red("❌ Failed to claim daily point:"), errorMsg);
    if (err.response?.data) {
      console.log("📦 Response body:", err.response.data);
    }
  }
}

async function runAccount(cookie, index) {
  const headers = {
    "Content-Type": "application/json",
    "Cookie": cookie,
    "Origin": "https://dashboard.synthelix.io",
    "Referer": "https://dashboard.synthelix.io/",
    "User-Agent": "Mozilla/5.0",
  };

  console.log(chalk.magenta(`\n🔁 Running account #${index + 1}`));

  await startNode(headers);

  const lastClaim = await getLastClaim(headers);
  if (lastClaim) {
    const nextClaim = dayjs.utc(lastClaim).add(1, 'day');
    if (dayjs.utc().isBefore(nextClaim)) {
      const claimTime = dayjs.utc(lastClaim).tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");
      console.log(chalk.yellow(`[INFO] Already claimed today. Last claim was at: ${claimTime} WIB`));
      return;
    }
  }

  await claimDaily(headers);
}

async function runAll() {
  while (true) {
    console.log(chalk.cyan(`\n=== Synthelix Bot Started ===\n`));
    for (let i = 0; i < cookies.length; i++) {
      await runAccount(cookies[i], i);
      await delay(1000); // delay antar akun
    }
    console.log(chalk.blue("\n⏳ Waiting 24 hours before next run...\n"));
    await delay(24 * 60 * 60 * 1000); // tunggu 24 jam
  }
}

runAll();
