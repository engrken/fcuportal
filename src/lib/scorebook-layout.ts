/**
 * Responsive ECR column pagination. Every assessment remains reachable without
 * shrinking workbook cells to unreadable widths. Totals always use the entire
 * gradebook, irrespective of the current assessment view.
 */
export type WorkbookCategory = { id: string; label: string; assessmentIds: string[] };
export type WorkbookSegment = {
  categoryId: string;
  categoryLabel: string;
  assessmentIds: string[];
  part: number;
  totalParts: number;
};
export type WorkbookPage = { segments: WorkbookSegment[]; label: string; assessmentCount: number };

export function workbookWidths(containerWidth: number) {
  const width = Number.isFinite(containerWidth) ? Math.max(760, containerWidth) : 1200;
  return {
    student: Math.round(Math.max(160, Math.min(250, width * .19))),
    attendance: Math.round(Math.max(78, Math.min(108, width * .072))),
    total: Math.round(Math.max(92, Math.min(122, width * .075))),
    final: Math.round(Math.max(76, Math.min(104, width * .064))),
    remark: Math.round(Math.max(104, Math.min(144, width * .086))),
    assessment: 78,
    equivalent: 73
  };
}
export function workbookColumnBudget(width: number) {
  const w = workbookWidths(width);
  return Math.max(180, Math.floor(width - w.student - w.attendance - w.total - w.final - w.remark - 10));
}
export function estimateWorkbookSegmentWidth(count: number, width: number) {
  const w = workbookWidths(width);
  return count * w.assessment + w.equivalent;
}
export function buildWorkbookPages(categories: WorkbookCategory[], width: number): WorkbookPage[] {
  const limit = workbookColumnBudget(width);
  const widths = workbookWidths(width);
  const maxItems = Math.max(1, Math.floor((limit - widths.equivalent) / widths.assessment));
  const chunks: WorkbookSegment[] = [];
  for (const category of categories) {
    if (!category.assessmentIds.length) continue;
    const count = Math.ceil(category.assessmentIds.length / maxItems);
    for (let i = 0; i < count; i++) {
      chunks.push({
        categoryId: category.id,
        categoryLabel: category.label,
        assessmentIds: category.assessmentIds.slice(i * maxItems, (i + 1) * maxItems),
        part: i + 1,
        totalParts: count
      });
    }
  }
  const pages: WorkbookPage[] = [];
  let grouped: WorkbookSegment[] = [];
  let used = 0;
  const flush = () => {
    if (!grouped.length) return;
    const titles = grouped.map(segment => segment.totalParts > 1
      ? `${segment.categoryLabel} (${segment.part}/${segment.totalParts})`
      : segment.categoryLabel);
    pages.push({
      segments: grouped,
      label: titles.length === 1 ? titles[0] : `${titles[0]} + ${titles.length - 1} more`,
      assessmentCount: grouped.reduce((sum, segment) => sum + segment.assessmentIds.length, 0)
    });
    grouped = []; used = 0;
  };
  for (const segment of chunks) {
    const needed = estimateWorkbookSegmentWidth(segment.assessmentIds.length, width);
    if (grouped.length && used + needed > limit) flush();
    grouped.push(segment);
    used += needed;
  }
  flush();
  return pages;
}
