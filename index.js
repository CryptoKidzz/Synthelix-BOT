const axios = require("axios");
const fs = require("fs");
const chalk = require("chalk").default;
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const banner = require('./config/banner');
dayjs.extend(utc);
dayjs.extend(timezone);

const cookies = fs.readFileSync("data.txt", "utf-8")
  .trim()
  .split("\n")
  .map(line => line.trim())
  .filter(line => line !== "" && /^__Secure-next-auth\.session-token=.+/.test(line));

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

async function stopNodeAndClaim(headers, nodeStatus) {
  const url = 'https://dashboard.synthelix.io/api/node/stop';

  const body = {
    claimedHours: nodeStatus.elapsedHours,
    pointsEarned: nodeStatus.currentEarnedPoints
  };

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await axios.post(url, body, { headers });
      if (response.status === 200) {
        const earned = response.data?.data?.earnedPoints ?? body.pointsEarned;
        console.log(chalk.green(`[✅] Successfully stopped node and claimed rewards!`));
        console.log(chalk.green(`[INFO] Earned Points from node :  ${earned}`));
        return true;
      }
    } catch (error) {
      console.log(chalk.red(`❌ Failed stop node and claim rewards (Attempt ${attempt}): ${error.message}`));
    }
    await delay(10000);
  }

  console.log(chalk.red(`❌ stop node and claim rewards failed after 5 attempts.`));
  return false;
}

async function retryOperation(fn, args, successCondition, description, retries = 5, delayMs = 10000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await fn(...args);
      if (successCondition(result)) return result;
    } catch (err) {
      console.log(chalk.red(`❌ Failed ${description} (Attempt ${attempt}):`), err.message);
    }
    if (attempt < retries) {
      console.log(chalk.yellow(`⏳ Retrying ${description} in ${delayMs / 1000}s...`));
      await delay(delayMs);
    }
  }
  console.log(chalk.red(`❌ ${description} failed after ${retries} attempts.`));
  return null;
}

async function startNode(headers) {
  return await retryOperation(
    async (h) => {
      const res = await axios.post("https://dashboard.synthelix.io/api/node/start", null, { headers: h });
      const { startTime } = res.data;
      const formattedTime = dayjs.utc(startTime).tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");
      console.log(chalk.green(`[INFO] Node started succesfully at: ${formattedTime} WIB`));
      return true;
    },
    [headers],
    (res) => res === true,
    "start node"
  );
}

async function claimDailyPoint(headers, amount) {
  return await retryOperation(
    async (h, amt) => {
      const res = await axios.post("https://dashboard.synthelix.io/api/rew/dailypoints", { points: amt }, { headers: h });
      const { points, lastDailyClaim } = res.data;
      const formattedTime = dayjs.utc(lastDailyClaim).tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");
      console.log(chalk.green(`[INFO] Claimed daily: succesfully at ${formattedTime} WIB`));
      console.log(chalk.green(`[INFO] claimed points daily : ${points}`));
      return true;
    },
    [headers, amount],
    (res) => res === true,
    "claim daily point"
  );
}

async function processAccount(cookie, index) {
  console.log(chalk.cyan(`\n🔄 Running account #${index + 1}`));
  const headers = buildHeaders(cookie);

  const nodeStatus = await getNodeStatus(headers);
  if (!nodeStatus) return;

  const lastClaim = await getLastClaim(headers);
  const now = dayjs.utc();
  const nextClaimTime = dayjs.utc(lastClaim).add(1, 'day');

  const totalPointsBefore = await getPoints(headers);

  if (nodeStatus.nodeRunning && nodeStatus.currentEarnedPoints > 0) {
    console.log(chalk.yellow(`[INFO] Stopping node to claim earned points...`));
    const stopSuccess = await stopNodeAndClaim(headers, nodeStatus);
    if (stopSuccess) {
      await delay(5000);
      const statusAfterStop = await getNodeStatus(headers);
      if (!statusAfterStop?.nodeRunning) {
        await startNode(headers);
      } else {
        console.log(chalk.yellow(`[INFO] Node already running, skipping start.`));
      }
    }
  }

  if (now.isAfter(nextClaimTime)) {
    const claimAmount = Math.min(totalPointsBefore, 1000);
    if (claimAmount > 0) {
      await claimDailyPoint(headers, claimAmount);
    }
  } else {
    const formattedLast = dayjs.utc(lastClaim).tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");
    console.log(chalk.yellow(`[INFO] Already claimed today. Last claim was at: ${formattedLast} WIB`));
    console.log(chalk.blue(`[INFO] Node Status: ${nodeStatus.nodeRunning ? "Running ✅" : "Stopped ❌"}`));
  }

  const totalPointsAfter = await getPoints(headers);
  console.log(chalk.cyan(`[INFO] Total Points: ${totalPointsAfter}`));
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
