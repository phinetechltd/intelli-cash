import React from "react";
import { LoginExperience } from "../../components/login-experience";

export default function AdminLoginPage() {
  return (
    <LoginExperience
      ariaLabel="Intelli Cash admin access"
      copyText="Restricted operations access for platform configuration, programme controls, integrations, audit review, and governance oversight."
      copyTitle="Admin operations access"
      demoRoles={["IWL_ADMIN"]}
      formTitle="Admin sign in"
    />
  );
}
