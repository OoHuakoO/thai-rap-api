# Skill: score-analysis

Implement assessment scoring, red flag detection, and comparison logic for this project.

## Trigger
`/score-analysis`

## Context

Scores live in the `Score` table (50 rows per assessment). Each score links to a `Question` which belongs to a `Dimension`. Business logic all lives in `AssessmentService`.

## Instructions

When asked to implement scoring, produce the following in `src/modules/assessments/assessment.service.ts`:

---

### 1. Calculate Dimension Scores

```ts
private calcDimensionScores(
  scores: Array<{ rawScore: number | null; question: { dimensionId: number; maxScore: number } }>,
  dimensions: Array<{ id: number; name: string; nameEn: string; weight: number; questionCount: number }>,
): DimensionScoreResult[] {
  return dimensions.map((dim) => {
    const dimScores = scores.filter((s) => s.question.dimensionId === dim.id);
    const earned = dimScores.reduce((sum, s) => sum + (s.rawScore ?? 0), 0);
    const max = dim.questionCount * 4;
    const percentScore = max === 0 ? 0 : (earned / max) * 100;
    const weightedScore = (percentScore * dim.weight) / 100;
    return { dimensionId: dim.id, dimensionName: dim.name, weight: dim.weight, earned, max, percentScore, weightedScore };
  });
}
```

### 2. Calculate Total Weighted Score

```ts
private calcTotalScore(dimensionScores: DimensionScoreResult[]): number {
  return dimensionScores.reduce((sum, d) => sum + d.weightedScore, 0);
}
```

### 3. Get Zone

```ts
private getZone(score: number): string {
  if (score < 40) return 'Red Zone';
  if (score < 60) return 'Survival Zone';
  if (score < 75) return 'Improve Zone';
  if (score < 85) return 'Growth Zone';
  return 'Model Zone';
}
```

### 4. Detect Red Flags

Run inside the submit transaction. Returns array of `Prisma.RedFlagCreateManyInput`.

```ts
private detectRedFlags(
  assessmentId: string,
  scores: Array<{ rawScore: number | null; question: { questionNo: number } }>,
): Prisma.RedFlagCreateManyInput[] {
  const byQ = (no: number) => scores.find((s) => s.question.questionNo === no)?.rawScore ?? 0;
  const avg = (nos: number[]) => nos.reduce((s, n) => s + byQ(n), 0) / nos.length;
  const flags: Prisma.RedFlagCreateManyInput[] = [];

  if (avg([8,9,10,11,12,13,14]) < 2)
    flags.push({ assessmentId, type: 'FOOD_SAFETY', severity: 'WARNING', triggerQuestions: [8,9,10,11,12,13,14] });

  const financialCritical = [28,29,30,31].filter((q) => byQ(q) <= 1);
  if (financialCritical.length)
    flags.push({ assessmentId, type: 'FINANCIAL', severity: 'CRITICAL', triggerQuestions: financialCritical });

  const opWarn = [35,36,39,41].filter((q) => byQ(q) <= 1);
  if (opWarn.length)
    flags.push({ assessmentId, type: 'OPERATION', severity: 'WARNING', triggerQuestions: opWarn });

  const mktWarn = [21,22].filter((q) => byQ(q) <= 1);
  if (mktWarn.length)
    flags.push({ assessmentId, type: 'MARKET', severity: 'WARNING', triggerQuestions: mktWarn });

  if (byQ(13) === 0)
    flags.push({ assessmentId, type: 'LEGAL', severity: 'CRITICAL', triggerQuestions: [13] });

  const ownerWarn = [47,48].filter((q) => byQ(q) < 2);
  if (ownerWarn.length)
    flags.push({ assessmentId, type: 'OWNER_READINESS', severity: 'WARNING', triggerQuestions: ownerWarn });

  if (byQ(49) < 2)
    flags.push({ assessmentId, type: 'EVIDENCE', severity: 'WARNING', triggerQuestions: [49] });

  if (byQ(50) < 2)
    flags.push({ assessmentId, type: 'GROWTH', severity: 'WARNING', triggerQuestions: [50] });

  return flags;
}
```

### 5. Submit Assessment (Transaction)

```ts
async submitAssessment(id: string, user: JwtPayload) {
  const assessment = await this.assessmentRepo.findByIdWithScores(id);
  if (!assessment) throw new NotFoundException('ASSESS_003', 'Assessment not found');
  if (assessment.status === 'SUBMITTED')
    throw new BadRequestException('ASSESS_004', 'Assessment already submitted');

  const scoredCount = assessment.scores.filter((s) => s.rawScore !== null).length;
  if (scoredCount < 50)
    throw new BadRequestException('ASSESS_002', `${50 - scoredCount} questions not yet scored`);

  const dimensions = await this.dimensionRepo.findAll();
  const dimensionScores = this.calcDimensionScores(assessment.scores, dimensions);
  const totalScore = this.calcTotalScore(dimensionScores);
  const redFlagsData = this.detectRedFlags(id, assessment.scores);

  await this.prisma.$transaction(async (tx) => {
    await tx.assessment.update({
      where: { id },
      data: { status: 'SUBMITTED', totalScore, submittedAt: new Date() },
    });
    if (redFlagsData.length) {
      await tx.redFlag.createMany({ data: redFlagsData });
    }
  });

  return { totalScore, zone: this.getZone(totalScore), dimensionScores, redFlagsGenerated: redFlagsData };
}
```

### 6. Round Comparison

```ts
async getComparison(storeId: string) {
  const assessments = await this.assessmentRepo.findSubmittedByStore(storeId);
  const dimensions = await this.dimensionRepo.findAll();
  const rounds: Round[] = ['T0','T1','T2','T3','T4'];

  const roundMap = Object.fromEntries(
    rounds.map((r) => {
      const a = assessments.find((x) => x.round === r);
      return [r, a ? { totalScore: a.totalScore, zone: this.getZone(a.totalScore!) } : null];
    }),
  );

  const dimensionTrend = dimensions.map((dim) => {
    const trend: Record<string, number | null> = {};
    for (const r of rounds) {
      const a = assessments.find((x) => x.round === r);
      if (!a) { trend[r] = null; continue; }
      const dimScores = a.scores.filter((s) => s.question.dimensionId === dim.id);
      const earned = dimScores.reduce((sum, s) => sum + (s.rawScore ?? 0), 0);
      const max = dim.questionCount * 4;
      trend[r] = max === 0 ? 0 : (earned / max) * 100;
    }
    return { dimensionId: dim.id, dimensionName: dim.name, ...trend };
  });

  return { storeId, rounds: roundMap, dimensionTrend };
}
```

---

## Incubation Readiness Score (Ranking)

Place in `RankingService`:

```ts
calcIRS(params: {
  t1Score: number;        // 0–100
  t0Score: number;        // 0–100
  pitchingAvg: number;    // 0–100
  mindsetRaw: number;     // sum of Q47 + Q48 scores (0–8), normalize to 0–100
  evidenceRaw: number;    // Q49 score (0–4), normalize to 0–100
}): number {
  const improvement = params.t1Score - params.t0Score;  // already 0–100 scale delta
  const mindset = (params.mindsetRaw / 8) * 100;
  const evidence = (params.evidenceRaw / 4) * 100;

  return (
    params.t1Score     * 0.40 +
    improvement        * 0.25 +
    params.pitchingAvg * 0.20 +
    mindset            * 0.10 +
    evidence           * 0.05
  );
}
```
