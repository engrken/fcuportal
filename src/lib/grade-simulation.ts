import { calculateGradeBreakdown, equivalentFromBands } from "./grades";

export type SimulatedAssessment = {
  id: string;
  title: string;
  maxScore: number;
  weight: number | null;
  points: number | null;
  remark: string | null;
};
export type SimulatedCategory = {
  id: string;
  name: string;
  weight: number;
  conversionBase: number;
  assessments: SimulatedAssessment[];
};
export type StudentSimulationGrade = {
  id: string;
  code: string;
  title: string;
  percent: number | null;
  finalGrade: string | null;
  remarks: string;
  categories: SimulatedCategory[];
  gradeBands: Array<{ minPercent: number; finalGrade: string; remarks: string }>;
};

/**
 * Unset/empty override = leave the teacher's score untouched.
 * A normal entry is hypothetical points; attendance uses status strings.
 * The mapping never writes to the gradebook or any persistence mechanism.
 */
export type ScoreScenario = Record<string, string>;

export function isAttendanceAssessment(item: Pick<SimulatedAssessment, "title">) {
  return item.title.toLocaleLowerCase().startsWith("attendance ·");
}

export function validScenarioEntry(item: SimulatedAssessment, value: string | undefined) {
  if (value === undefined || value === "") return true;
  if (isAttendanceAssessment(item)) return value === "PRESENT" || value === "ABSENT" || value === "EXCUSED";
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= item.maxScore;
}

export function simulateStudentGrade(grade: StudentSimulationGrade, scenario: ScoreScenario = {}) {
  const categories = grade.categories.map(category => ({
    id: category.id,
    parentId: null,
    weight: category.weight,
    conversionBase: category.conversionBase,
    assessments: category.assessments.map(item => {
      const override = scenario[item.id];
      const valid = validScenarioEntry(item, override);
      const changed = valid && override !== undefined && override !== "";
      const status = changed && isAttendanceAssessment(item) ? override : undefined;
      const points = changed
        ? status === "PRESENT" ? item.maxScore
          : status === "ABSENT" || status === "EXCUSED" ? null
          : Number(override)
        : item.points;
      const remark = changed ? status || null : item.remark;
      return {
        title: item.title, maxScore: item.maxScore, weight: item.weight,
        scores: points !== null || remark !== null ? [{ points, remark }] : []
      };
    })
  }));
  const breakdown = calculateGradeBreakdown(categories);
  return {
    ...breakdown,
    equivalent: equivalentFromBands(breakdown.totalPercent, grade.gradeBands)
  };
}

export function invalidScenarioCount(grade: StudentSimulationGrade, scenario: ScoreScenario) {
  return grade.categories.reduce((n, category) => n + category.assessments.filter(item =>
    !validScenarioEntry(item, scenario[item.id])
  ).length, 0);
}

export function scenarioPendingScores(grade: StudentSimulationGrade, ratio: number, previous: ScoreScenario = {}) {
  const result = { ...previous };
  const target = Math.min(1, Math.max(0, ratio));
  for (const category of grade.categories) {
    for (const item of category.assessments) {
      if (isAttendanceAssessment(item) || item.points !== null || item.remark !== null) continue;
      if (!Number.isFinite(item.maxScore) || item.maxScore <= 0) continue;
      result[item.id] = String(Math.round(item.maxScore * target * 100) / 100);
    }
  }
  return result;
}
