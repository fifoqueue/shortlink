const AUTOMATED_USER_AGENT_HINTS = [
  /\bbot\b/i,
  /crawler/i,
  /spider/i,
  /preview/i,
  /embed/i,
  /unfurl/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /slackbot/i,
  /discordbot/i,
  /telegrambot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /kakaotalk/i,
  /\bline\//i,
  /\bcurl\//i,
  /\bwget\//i,
  /httpie/i,
  /postmanruntime/i,
  /python-requests/i,
  /go-http-client/i,
  /node-fetch/i,
  /\bundici\b/i,
  /\baxios\//i,
  /\bokhttp\//i,
  /headlesschrome/i,
  /phantomjs/i,
  /playwright/i,
  /puppeteer/i,
  /lighthouse/i,
];

const HUMAN_BROWSER_USER_AGENT_PATTERNS = [
  /\bFirefox\/\d+/i,
  /\bFxiOS\/\d+/i,
  /\bEdg(?:A|iOS)?\/\d+/i,
  /\bOPR\/\d+/i,
  /\bOpera\/\d+/i,
  /\bSamsungBrowser\/\d+/i,
  /\bCriOS\/\d+/i,
  /\bChrome\/\d+[\d.]*.*\bSafari\/\d+/i,
  /\bVersion\/\d+[\d.]*.*\bSafari\/\d+/i,
];

export function isHumanBrowserUserAgent(userAgent: string | null) {
  const value = userAgent?.trim();
  if (!value) return false;
  if (AUTOMATED_USER_AGENT_HINTS.some((pattern) => pattern.test(value))) {
    return false;
  }
  return HUMAN_BROWSER_USER_AGENT_PATTERNS.some((pattern) =>
    pattern.test(value),
  );
}

export function shouldRenderOpenGraphPreview(userAgent: string | null) {
  return !isHumanBrowserUserAgent(userAgent);
}
