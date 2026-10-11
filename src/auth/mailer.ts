export interface OtpMailer {
  sendCode(email: string, code: string): Promise<void>;
}

export type ResendConfig = { apiKey: string; from: string; appName: string };

export class ResendMailer implements OtpMailer {
  constructor(private readonly config: ResendConfig) {}

  async sendCode(email: string, code: string): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: this.config.from,
        to: email,
        subject: `${code} is your ${this.config.appName} code`,
        text: `Your ${this.config.appName} sign-in code is ${code}. It expires in 10 minutes.`,
      }),
    });
    if (!res.ok) throw new Error(`mail provider rejected the request: ${res.status}`);
  }
}

export class ConsoleMailer implements OtpMailer {
  async sendCode(email: string, code: string): Promise<void> {
    console.log(`[otp] ${email} -> ${code}`);
  }
}
