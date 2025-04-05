const axios = require("axios");
const fs = require("fs");
const chalk = require("chalk").default;
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const banner = require('./config/banner');
dayjs.extend(utc);
dayjs.extend(timezone);

const cookies = fs.readFileSync("data.txt", "utf-8").trim().split("\n");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildHeaders(cookie) {
  return {
    "Content-Type": "application/json",
    "Cookie": cookie,
    "Origin": "https://dashboard.synthelix.io",
    "Referer": "https://dashboard.synthelix.io/",
    "User-Agent": "Mozilla/5.0",
  };
}

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

async function getNodeStatus(headers) {
  try {
    const res = await axios.get("https://dashboard.synthelix.io/api/node/status", { headers });
    return res.data;
  } catch (err) {
    console.log(chalk.red("❌ Failed to get node status:"), err.message);
    return null;
  }
}

async function startNode(headers) {
  try {
    const res = await axios.post("https://dashboard.synthelix.io/api/node/start", null, { headers });
    const { startTime } = res.data;
    const formattedTime = dayjs.utc(startTime).tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");
    console.log(chalk.green(`[INFO] Node started succesfully at: ${formattedTime} WIB`));
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    if (msg === "Node is already running") {
      console.log(chalk.green("[INFO] Node is already running."));
    } else {
      console.log(chalk.red("❌ Failed to start node:"), msg);
    }
  }
}

async function claimDailyPoint(headers, amount) {
  try {
    const res = await axios.post("https://dashboard.synthelix.io/api/rew/dailypoints", { points: amount }, { headers });
    const { points, lastDailyClaim } = res.data;
    const formattedTime = dayjs.utc(lastDailyClaim).tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");
    console.log(chalk.green(`[INFO] Claimed daily: succesfully at ${formattedTime} WIB`));
    console.log(chalk.green(`[INFO] Points claimed : ${points}`));
  } catch (err) {
    const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message;
    console.log(chalk.red("❌ Failed to claim daily point:"), errorMsg);
    if (err.response?.data) {
      console.log("📦 Response body:", err.response.data);
    }
  }
}

async function processAccount(cookie, index) {
  console.log(chalk.cyan(`\n🔄 Running account #${index + 1}`));
  const headers = buildHeaders(cookie);

  await startNode(headers);

  const lastClaim = await getLastClaim(headers);
  const now = dayjs.utc();

  if (lastClaim) {
    const nextClaimTime = dayjs.utc(lastClaim).add(1, 'day');
    if (now.isBefore(nextClaimTime)) {
      const formattedLast = dayjs.utc(lastClaim).tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");
      console.log(chalk.yellow(`[INFO] Already claimed today. Last claim was at: ${formattedLast} WIB`));

      const nodeStatus = await getNodeStatus(headers);
      if (nodeStatus) {
        console.log(chalk.blue(`[INFO] Node Status: ${nodeStatus.nodeRunning ? "Running ✅" : "Stopped ❌"}`));
        console.log(chalk.blue(`[INFO] Earned Points from Node: ${nodeStatus.currentEarnedPoints}`));
      }

      const totalPoints = await getPoints(headers);
      console.log(chalk.blue(`[INFO] Total Points: ${totalPoints}`));

      return;
    }
  }

  const beforePoints = await getPoints(headers);
  console.log(chalk.cyan(`[INFO] Points before claim: ${beforePoints}`));

  const claimAmount = beforePoints > 0 ? beforePoints : 1;
  await claimDailyPoint(headers, claimAmount);

  const totalPoints = await getPoints(headers);
  console.log(chalk.cyan(`[INFO] Total Points: ${totalPoints}`));
}

async function runAllAccounts() {
  while (true) {
    for (let i = 0; i < cookies.length; i++) {
      try {
        await processAccount(cookies[i], i);
      } catch (err) {
        console.log(chalk.red(`❌ Error running account #${i + 1}:`), err.message);
      }
    }
    console.log("\n⏳ Waiting 24 hours before next run...");
    await delay(24 * 60 * 60 * 1000);
  }
}

runAllAccounts();