export interface CreditScoreInputs {
  savingsConsistency: number;
  repaymentRate: number;
  attendanceRate: number;
  constitutionCompliance: number;
  socialFundHealth: number;
  cycleAge: number;
  securityCompliance: number;
}

const weights: Record<keyof CreditScoreInputs, number> = {
  savingsConsistency: 20,
  repaymentRate: 25,
  attendanceRate: 15,
  constitutionCompliance: 15,
  socialFundHealth: 10,
  cycleAge: 10,
  securityCompliance: 5
};

export function calculateCreditScore(inputs: CreditScoreInputs) {
  const breakdown: CreditScoreInputs = {
    savingsConsistency: weighted(inputs.savingsConsistency, "savingsConsistency"),
    repaymentRate: weighted(inputs.repaymentRate, "repaymentRate"),
    attendanceRate: weighted(inputs.attendanceRate, "attendanceRate"),
    constitutionCompliance: weighted(
      inputs.constitutionCompliance,
      "constitutionCompliance"
    ),
    socialFundHealth: weighted(inputs.socialFundHealth, "socialFundHealth"),
    cycleAge: weighted(inputs.cycleAge, "cycleAge"),
    securityCompliance: weighted(inputs.securityCompliance, "securityCompliance")
  };

  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);

  return {
    score: Math.max(0, Math.min(100, total)),
    breakdown
  };
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function weighted(value: number, key: keyof CreditScoreInputs) {
  return Math.round(clampPercent(value) * (weights[key] / 100));
}
