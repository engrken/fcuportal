export type GradeCategoryInput = { name: string; weight: number; conversionBase: number };

export const SAMPLE_CATEGORIES: GradeCategoryInput[] = [
  { name: "Design", weight: 20, conversionBase: 30 },
  { name: "Program Flow", weight: 30, conversionBase: 30 },
  { name: "Prototype", weight: 25, conversionBase: 30 },
  { name: "Activities", weight: 15, conversionBase: 30 },
  { name: "Attendance, Recitation & Participation", weight: 10, conversionBase: 0 }
];

export const SAMPLE_GRADE_BANDS = [
  { minPercent: 98, finalGrade: "1.00", remarks: "Passed" }, { minPercent: 95, finalGrade: "1.25", remarks: "Passed" },
  { minPercent: 92, finalGrade: "1.50", remarks: "Passed" }, { minPercent: 89, finalGrade: "1.75", remarks: "Passed" },
  { minPercent: 86, finalGrade: "2.00", remarks: "Passed" }, { minPercent: 83, finalGrade: "2.25", remarks: "Passed" },
  { minPercent: 80, finalGrade: "2.50", remarks: "Passed" }, { minPercent: 77, finalGrade: "2.75", remarks: "Passed" },
  { minPercent: 75, finalGrade: "3.00", remarks: "Passed" }, { minPercent: 0, finalGrade: "5.00", remarks: "Failed" }
];

export type GradeCalculationCategory = {
  id: string;
  parentId?: string | null;
  weight: number;
  conversionBase?: number;
  assessments: Array<{ maxScore: number; weight?: number | null; scores: Array<{ points: number | null; remark?: string | null }> }>;
};

export function calculateCategoryPercent(category: Pick<GradeCalculationCategory, "conversionBase" | "assessments">) {
  // Grade computation is proportional to points earned; do not apply a category credit floor.
  const base = 0;
  const active = category.assessments.filter(assessment => assessment.scores[0]?.remark !== "EXCUSED");
  if (!active.length) return null;
  if (category.assessments.some(assessment => assessment.weight !== null && assessment.weight !== undefined)) {
    const totalWeight = active.reduce((sum, assessment) => sum + (assessment.weight ?? 0), 0);
    if (!totalWeight) return null;
    const weighted = active.reduce((sum, assessment) => {
      const score = assessment.scores[0];
      const points = score?.remark === "PRESENT" ? assessment.maxScore : score?.remark === "ABSENT" ? 0 : score?.points ?? 0;
      const percent = base + (points / assessment.maxScore) * (100 - base);
      return sum + percent * (assessment.weight ?? 0);
    }, 0);
    return Math.round((weighted / totalWeight) * 100) / 100;
  }
  const possible = active.reduce((sum, assessment) => sum + assessment.maxScore, 0);
  const earned = active.reduce((sum, assessment) => sum + (assessment.scores[0]?.remark === "PRESENT" ? assessment.maxScore : assessment.scores[0]?.remark === "ABSENT" ? 0 : assessment.scores[0]?.points ?? 0), 0);
  return possible ? Math.round((base + (earned / possible) * (100 - base)) * 100) / 100 : null;
}

export function calculateFinal(categories: GradeCalculationCategory[]) {
  if (!categories.some(category => category.assessments.some(assessment => assessment.scores.some(score => score.points !== null || (!!score.remark && score.remark !== "EXCUSED"))))) return null;
  const childrenByParent = new Map<string | null, GradeCalculationCategory[]>();
  for (const category of categories) {
    const parentId = category.parentId ?? null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(category);
    childrenByParent.set(parentId, siblings);
  }

  const calculateContribution = (category: GradeCalculationCategory, path = new Set<string>()): number | null => {
    if (path.has(category.id)) return null;
    const nextPath = new Set(path).add(category.id);
    const children = childrenByParent.get(category.id) ?? [];
    if (children.length) {
      return children.reduce((sum, child) => sum + (calculateContribution(child, nextPath) ?? 0), 0);
    }
    if (!category.assessments.length) return 0;
    const percent = calculateCategoryPercent({ conversionBase: category.conversionBase, assessments: category.assessments });
    return percent === null ? null : percent * category.weight / 100;
  };

  const result = (childrenByParent.get(null) ?? []).reduce((sum, category) => sum + (calculateContribution(category) ?? 0), 0);
  return Math.round(result * 100) / 100;
}

export function defaultEquivalent(percent: number | null) {
  if (percent === null) return { finalGrade: null, remarks: "Not yet graded" };
  const bands = [98, 95, 92, 89, 86, 83, 80, 77, 75];
  const grades = ["1.00", "1.25", "1.50", "1.75", "2.00", "2.25", "2.50", "2.75", "3.00"];
  const index = bands.findIndex(b => percent >= b);
  return { finalGrade: index < 0 ? "5.00" : grades[index], remarks: percent >= 75 ? "Passed" : "Failed" };
}

export function equivalentFromBands(percent: number | null, bands: Array<{ minPercent: number; finalGrade: string; remarks: string }>) {
  if (percent === null) return { finalGrade: null, remarks: "Not yet graded" };
  const match = [...bands].sort((a, b) => b.minPercent - a.minPercent).find(b => percent >= b.minPercent);
  return match ? { finalGrade: match.finalGrade, remarks: match.remarks } : defaultEquivalent(percent);
}
