// Splits an infra/zetaris SQL file into single statements: "-- @@" lines separate statements (a multi-table
// COMPILE USL must go as one), full-line comments are dropped, trailing semicolons removed (Lightning SQL rule).
export function statements(sql: string) {
  return sql.split(/^-- @@\s*$/m)
    .map((s) => s.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n").trim().replace(/;\s*$/, ""))
    .filter(Boolean);
}
