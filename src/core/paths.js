'use strict';

/**
 * Claim-path grammar.
 *
 * A claim path addresses one fact inside the resume tree:
 *   employment.qualcomm.work.codebuddy.statement
 *
 * A pattern may use:
 *   *   exactly one segment
 *   **  zero or more segments, terminal only
 *
 * A scope is { include: [pattern], exclude: [pattern] }.
 *
 * The rule the whole authority model rests on is monotonic attenuation:
 * a child's scope must be contained in its parent's, and exclusions inherit
 * downward and may only grow. Everything here exists to make that checkable.
 */

function segments(path) {
  return String(path).split('.').filter(Boolean);
}

function assertValidPattern(pattern) {
  const segs = segments(pattern);
  const deep = segs.indexOf('**');
  if (deep !== -1 && deep !== segs.length - 1) {
    throw new Error(`invalid pattern "${pattern}": ** may only appear as the final segment`);
  }
  return segs;
}

/** Does `pattern` match a concrete claim path? */
function matchesPattern(pattern, path) {
  const P = assertValidPattern(pattern);
  const S = segments(path);
  let i = 0;
  let j = 0;
  while (i < P.length) {
    if (P[i] === '**') return true; // terminal, swallows zero or more
    if (j >= S.length) return false;
    if (P[i] !== '*' && P[i] !== S[j]) return false;
    i += 1;
    j += 1;
  }
  return j === S.length;
}

/**
 * Is every path matched by `child` also matched by `parent`?
 * This is a subset test over patterns, not over concrete paths.
 */
function patternCovers(parent, child) {
  const P = assertValidPattern(parent);
  const C = assertValidPattern(child);
  let i = 0;
  let j = 0;
  while (i < P.length) {
    if (P[i] === '**') return true;
    if (j >= C.length) return false;
    if (P[i] === '*') {
      if (C[j] === '**') return false; // one segment cannot cover many
    } else if (C[j] !== P[i]) {
      return false; // a literal covers only the identical literal
    }
    i += 1;
    j += 1;
  }
  return j === C.length;
}

function normaliseScope(scope) {
  return {
    include: (scope && scope.include) || [],
    exclude: (scope && scope.exclude) || []
  };
}

/** May an attester holding `scope` sign this claim path? */
function scopeAllows(scope, path) {
  const s = normaliseScope(scope);
  if (s.exclude.some((p) => matchesPattern(p, path))) return false;
  return s.include.some((p) => matchesPattern(p, path));
}

/**
 * Is `child` contained in `parent`?
 *  - every included pattern of the child must be covered by some parent include
 *  - no child include may reach into a parent exclusion
 *  - every parent exclusion must still be excluded by the child (exclusions may only grow)
 */
function scopeContains(parent, child) {
  const P = normaliseScope(parent);
  const C = normaliseScope(child);

  for (const inc of C.include) {
    if (!P.include.some((p) => patternCovers(p, inc))) {
      return { ok: false, code: 'scope-widened', detail: `"${inc}" is not covered by the parent scope` };
    }
    if (P.exclude.some((ex) => patternCovers(ex, inc) || patternCovers(inc, ex))) {
      return { ok: false, code: 'excluded-path-regranted', detail: `"${inc}" overlaps a parent exclusion` };
    }
  }

  for (const ex of P.exclude) {
    if (!C.exclude.some((c) => patternCovers(c, ex))) {
      return { ok: false, code: 'exclusion-dropped', detail: `parent exclusion "${ex}" is not inherited` };
    }
  }

  return { ok: true };
}

module.exports = {
  segments,
  matchesPattern,
  patternCovers,
  normaliseScope,
  scopeAllows,
  scopeContains
};
