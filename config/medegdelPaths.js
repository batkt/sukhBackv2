const path = require("path");

const ENV_ROOT = process.env.MEDEGDEL_UPLOAD_ROOT
  ? path.resolve(process.env.MEDEGDEL_UPLOAD_ROOT)
  : null;

/**
 * Single root for uploads. All medegdel/chat files must go here so serve finds them.
 * Prefer process.cwd() so it matches the legacy "public/medegdel/..." relative path.
 */
function getMedegdelPublicRoot() {
  if (ENV_ROOT) return ENV_ROOT;
  return path.join(process.cwd(), "public", "medegdel");
}

/**
 * Ordered list of directory roots for serving. Upload root (getMedegdelPublicRoot) is always first
 * so files saved by upload are found when serving. Fallbacks for different run contexts.
 */
function getMedegdelRoots() {
  const uploadRoot = getMedegdelPublicRoot();
  const roots = [uploadRoot];
  if (!ENV_ROOT) {
    if (require.main && require.main.filename) {
      const alt = path.join(path.dirname(require.main.filename), "public", "medegdel");
      if (alt !== uploadRoot) roots.push(alt);
    }
    const relRoot = path.join(__dirname, "..", "public", "medegdel");
    if (relRoot !== uploadRoot && !roots.includes(relRoot)) roots.push(relRoot);
  }
  return roots;
}

module.exports = { getMedegdelRoots, getMedegdelPublicRoot };
