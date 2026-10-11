export type FailureScenario = {
  id: string;
  label: string;
  amountPaise: number;
  method: "card" | "upi" | "netbanking";
  errorCode: string;
  errorReason: string;
  issuer?: string;
  bank?: string;
  vpa?: string;
};

export const FAILURE_SCENARIOS: readonly FailureScenario[] = [
  {
    id: "bank_timeout",
    label: "Bank timeout",
    amountPaise: 129900,
    method: "card",
    errorCode: "BAD_REQUEST_ERROR",
    errorReason: "card_declined",
    issuer: "HDFC",
  },
  {
    id: "low_balance",
    label: "Insufficient funds",
    amountPaise: 49900,
    method: "upi",
    errorCode: "BAD_REQUEST_ERROR",
    errorReason: "insufficient_funds",
    vpa: "customer@okaxis",
  },
  {
    id: "expired_card",
    label: "Expired card",
    amountPaise: 89900,
    method: "card",
    errorCode: "BAD_REQUEST_ERROR",
    errorReason: "card_expired",
    issuer: "ICICI",
  },
  {
    id: "risk_hold",
    label: "Risk hold",
    amountPaise: 499900,
    method: "card",
    errorCode: "BAD_REQUEST_ERROR",
    errorReason: "payment_risk_check_failed",
    issuer: "SBI",
  },
];

export const scenarioById = (id: string): FailureScenario | undefined => FAILURE_SCENARIOS.find((s) => s.id === id);
