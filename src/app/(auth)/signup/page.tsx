import { SignupForm } from "../AuthForms";

export default function SignupPage() {
  return <SignupForm needsCode={!!process.env.SIGNUP_CODE?.trim()} closed={process.env.ALLOW_SIGNUP?.toLowerCase() === "false"} />;
}
