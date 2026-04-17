const DEFAULT_FRONTEND_URL = "http://localhost:5173";
const DEV_FRONTEND_URLS = [DEFAULT_FRONTEND_URL, "http://localhost:5174"];

const normalizeOrigin = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const getFrontendUrl = () => normalizeOrigin(process.env.FRONTEND_URL) || DEFAULT_FRONTEND_URL;

const getAllowedFrontendUrls = () =>
  [...new Set([process.env.FRONTEND_URL, ...DEV_FRONTEND_URLS].map(normalizeOrigin).filter(Boolean))];

const isAllowedFrontendUrl = (value) => {
  const origin = normalizeOrigin(value);
  return Boolean(origin && getAllowedFrontendUrls().includes(origin));
};

const getFrontendUrlFromRequest = (req) => {
  const requestCandidates = [
    req?.query?.frontendUrl,
    req?.query?.frontend_url,
    req?.headers?.origin,
    req?.headers?.referer,
  ]
    .map(normalizeOrigin)
    .filter(Boolean);

  return requestCandidates.find(isAllowedFrontendUrl) || getFrontendUrl();
};

const buildFrontendUrl = (req, path = "/") =>
  new URL(path, `${getFrontendUrlFromRequest(req)}/`).toString();

module.exports = {
  DEFAULT_FRONTEND_URL,
  getAllowedFrontendUrls,
  getFrontendUrl,
  getFrontendUrlFromRequest,
  isAllowedFrontendUrl,
  buildFrontendUrl,
};
