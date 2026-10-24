import { describe, expect, it } from "vitest";
import { bankName, customerLabel, rupees } from "./format";

describe("rupees", () => {
  it("converts paise to whole rupees with Indian digit grouping", () => {
    expect(rupees(0)).toBe("₹0");
    expect(rupees(12_345_00)).toBe("₹12,345");
    expect(rupees(1_23_45_678_00)).toBe("₹1,23,45,678");
  });

  it("rounds to the nearest rupee", () => {
    expect(rupees(149)).toBe("₹1");
    expect(rupees(150)).toBe("₹2");
  });
});

describe("customerLabel", () => {
  it("rewrites a cust_ reference to a readable label", () => {
    expect(customerLabel("cust_abc123")).toBe("customer_abc123");
  });

  it("leaves other references untouched", () => {
    expect(customerLabel("alice@example.com")).toBe("alice@example.com");
    expect(customerLabel("customer_9")).toBe("customer_9");
  });
});

describe("bankName", () => {
  it("expands known IFSC prefixes case-insensitively", () => {
    expect(bankName("HDFC")).toBe("HDFC Bank");
    expect(bankName("sbin")).toBe("State Bank of India");
  });

  it("falls back to the raw code for unknown banks", () => {
    expect(bankName("ZZZZ")).toBe("ZZZZ");
  });
});
