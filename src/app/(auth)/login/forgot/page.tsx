import { ForgotPassword } from "../../AuthForms";
import { emailEnabled } from "@/lib/email";

export const metadata = { title: "Reset password · Thrivie" };

export default function ForgotPage() {
  return <ForgotPassword emailReset={emailEnabled()} />;
}
