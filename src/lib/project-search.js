/**
 * Ranked, multi-field search for Taiseel's Rwanda project register.
 *
 * Search is intentionally local: project discovery should remain available
 * without adding a remote service or a runtime dependency.
 *
 * @typedef {Object} SearchableProject
 * @property {string} id
 * @property {string} name
 * @property {string} developer
 * @property {string|null=} owner
 * @property {string=} category
 * @property {string|null=} district
 * @property {string|null=} city
 * @property {string|null=} sector
 * @property {string|null=} cell
 * @property {string=} status
 * @property {string|null=} route
 * @property {string=} parcelUpi
 */

/** @type {Array<{keys: string[], weight: number}>} */
const SEARCH_FIELDS = [
  { keys: ["name"], weight: 120 },
  { keys: ["id"], weight: 108 },
  { keys: ["parcelUpi"], weight: 102 },
  { keys: ["developer"], weight: 88 },
  { keys: ["district", "sector", "cell", "city"], weight: 76 },
  { keys: ["category"], weight: 58 },
  { keys: ["owner", "status", "route"], weight: 42 }
];

/** @param {unknown} value */
function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Returns the edit distance, stopping once the requested threshold is exceeded.
 * @param {string} left
 * @param {string} right
 * @param {number} threshold
 */
function boundedEditDistance(left, right, threshold) {
  if (Math.abs(left.length - right.length) > threshold) return threshold + 1;
  if (left === right) return 0;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let rowMinimum = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      const value = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + cost
      );
      current[column] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > threshold) return threshold + 1;
    previous = current;
  }
  return previous[right.length];
}

/**
 * Match a single query token against one field.
 * Exact and prefix matches win; edit-distance matching is deliberately narrow.
 * @param {string} queryToken
 * @param {string} fieldText
 * @returns {number}
 */
function tokenMatchQuality(queryToken, fieldText) {
  if (!fieldText) return 0;
  const words = fieldText.split(" ").filter(Boolean);
  if (words.includes(queryToken)) return 1;
  if (words.some((word) => word.startsWith(queryToken))) return 0.86;
  if (words.some((word) => word.length >= 5 && word.includes(queryToken))) return 0.72;

  // Short words produce too many false positives, so they only match exactly.
  if (queryToken.length < 5) return 0;
  const maxDistance = queryToken.length >= 8 ? 2 : 1;
  let bestDistance = maxDistance + 1;
  for (const word of words) {
    if (word.length < 5 || Math.abs(word.length - queryToken.length) > maxDistance) continue;
    bestDistance = Math.min(bestDistance, boundedEditDistance(queryToken, word, maxDistance));
    if (bestDistance === 0) break;
  }
  return bestDistance <= maxDistance ? 0.56 - bestDistance * 0.08 : 0;
}

/**
 * Rank projects against every query token and return the original records.
 *
 * Each token must match at least one searchable field. This allows a query such
 * as "tower gasabo" to match a project name and its district without making
 * unrelated records appear. Ties retain their original register order.
 *
 * @template {SearchableProject} T
 * @param {T[]} projects
 * @param {string} query
 * @returns {T[]}
 */
export function searchRwandaProjects(projects, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return projects;

  const queryTokens = [...new Set(normalizedQuery.split(" ").filter(Boolean))];
  if (queryTokens.length === 0) return projects;

  return projects
    .map((project, index) => {
      /** @type {Array<{text: string, weight: number}>} */
      const fields = [];
      for (const group of SEARCH_FIELDS) {
        for (const key of group.keys) {
          const value = project[key];
          const text = normalizeSearchText(value);
          if (text) fields.push({ text, weight: group.weight });
        }
      }

      let score = 0;
      for (const token of queryTokens) {
        let best = 0;
        for (const field of fields) {
          const quality = tokenMatchQuality(token, field.text);
          best = Math.max(best, quality * field.weight);
        }
        if (best === 0) return { project, index, score: -1 };
        score += best;
      }

      const normalizedName = normalizeSearchText(project.name);
      if (normalizedName === normalizedQuery) score += 90;
      else if (normalizedName.startsWith(normalizedQuery)) score += 35;

      return { project, index, score };
    })
    .filter((result) => result.score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((result) => result.project);
}
