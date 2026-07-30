const LOGIN_ROUTE = 'pages/login/login';

function pageRoute(page) {
  return page && typeof page.route === 'string' ? page.route : '';
}

function getPortalExitTargetRoute(pageStack, portalPage) {
  const pages = Array.isArray(pageStack) ? pageStack : [];
  if (!pages.length) return '';

  const portalIndex = pages.indexOf(portalPage);
  if (portalIndex >= 0 && portalIndex !== pages.length - 1) return '';
  if (portalIndex > 0) return pageRoute(pages[portalIndex - 1]);
  if (portalIndex === 0) return '';

  return pageRoute(pages[pages.length - 1]);
}

function shouldClearAuthenticationOnPortalExit(pageStack, portalPage) {
  return getPortalExitTargetRoute(pageStack, portalPage) === LOGIN_ROUTE;
}

module.exports = {
  getPortalExitTargetRoute,
  shouldClearAuthenticationOnPortalExit
};
