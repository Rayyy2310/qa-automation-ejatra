function resolveUrl(baseUrl, path) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${baseUrl ? baseUrl.replace(/\/$/, '') : ''}/${path.replace(/^\//, '')}`;
}

function resolveTargetString(target) {
  return typeof target === 'object' ? target?.value || '' : target || '';
}

module.exports = { resolveUrl, resolveTargetString };
