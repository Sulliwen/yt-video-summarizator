chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== "ytsum:copy") return;
  const t = document.getElementById("t");
  t.value = msg.text;
  t.select();
  reply(document.execCommand("copy"));
});
