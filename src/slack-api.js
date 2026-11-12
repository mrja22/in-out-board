export async function slackCall(env, method, payload) {
  if (!env.SLACK_BOT_TOKEN) {
    console.log(`[slack disabled] ${method} -> ${payload.channel || payload.view?.callback_id || ""}: ${payload.text || ""}`);
    return env.DEV_MODE === "1" ? { ok: true, ts: `dev.${Date.now()}`, channel: payload.channel } : { ok: false };
  }
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Authorization": `Bearer ${env.SLACK_BOT_TOKEN}`
    },
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) console.error(`${method} failed: ${body.error || res.status}`, JSON.stringify(body.response_metadata || {}));
  return body;
}
export async function slackPost(env, channel, text, blocks) {
  return !!(await slackCall(env, "chat.postMessage", blocks ? { channel, text, blocks } : { channel, text })).ok;
}
